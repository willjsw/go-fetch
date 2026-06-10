// GoFetch widget frontend — store ↔ renderer split (Task 30 / GF-109).
//
// Receives session snapshots from the Rust backend over Tauri IPC and keeps them
// in a single store (`currentSessions`). A mode dispatcher (`renderActiveMode`)
// draws the snapshot via the active mode's renderer — today the card list
// (cards-mode.js), with the animated character mode wired in GF-110+. Clicking a
// session opens a detail popover with the (Rust-generated, local-only) one-line
// summary plus state, project, path, and elapsed time (DV-1/DV-3).

import { characterSvg } from "./character.js";
import { renderCardsMode } from "./cards-mode.js";
import { STATE_VISUALS, visualKey, escapeHtml, formatElapsed } from "./utils.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow, currentMonitor, LogicalSize } = window.__TAURI__.window;

/**
 * Cap the widget's maximum size to 1/4 of the screen *area* — each side ×0.5
 * (WC-8 / D3). Recomputed at startup; uses logical pixels so it behaves the
 * same on Retina. Best-effort: if the monitor query or permission is
 * unavailable, the window is simply left unconstrained.
 */
async function applyMaxSize() {
  try {
    const mon = await currentMonitor();
    if (!mon) return;
    const sf = mon.scaleFactor || 1;
    const logW = mon.size.width / sf;
    const logH = mon.size.height / sf;
    // Cap at 1/4 of the screen area, but never below the default window size
    // (360×600, WC-12) — otherwise on laptops where half the screen height is
    // < 600 the default would be clamped and the window would shrink on launch.
    const maxW = Math.max(360, Math.floor(logW * 0.5));
    const maxH = Math.max(600, Math.floor(logH * 0.5));
    await getCurrentWindow().setMaxSize(new LogicalSize(maxW, maxH));
  } catch (_err) {
    /* leave unconstrained on failure */
  }
}

/** Wire the custom resize handles (WC-8): frameless windows have no native
 * grips, so each edge/corner starts a resize drag in its direction (F12). */
function wireResizeHandles() {
  document.querySelectorAll(".rsz").forEach((handle) => {
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      getCurrentWindow()
        .startResizeDragging(handle.dataset.resize)
        .catch(() => {});
    });
  });
}

// ---------------------------------------------------------------------------
// Store: single source of truth for the current snapshot + active render mode.
// `sessions-update` events and the initial `refresh()` only mutate the store;
// `renderActiveMode()` is the one place that paints the DOM, so adding a new
// mode (GF-110+) means adding a branch here, not a new IPC path.
// ---------------------------------------------------------------------------

/** Latest snapshot, kept so a card click can look its session up by id. */
let currentSessions = [];
/** Active render mode: 'cards' (default) | 'anim' (wired in GF-110+). */
let currentMode = "cards";

/** Replace the store snapshot and repaint the active mode. */
function setSessions(sessions) {
  currentSessions = Array.isArray(sessions) ? sessions : [];
  renderActiveMode();
}

/** Switch the active render mode and repaint (used by the mode tabs, GF-110). */
export function setMode(mode) {
  currentMode = mode === "anim" ? "anim" : "cards";
  renderActiveMode();
}

/**
 * Paint the current store snapshot using the active mode's renderer. An empty
 * list shows the empty state in cards mode (DI-6). Until the animated mode is
 * implemented (GF-110+) every mode falls back to cards.
 */
function renderActiveMode() {
  const empty = document.getElementById("empty-state");
  const list = document.getElementById("sessions");
  if (!empty || !list) return;

  const hasSessions = currentSessions.length > 0;
  empty.hidden = hasSessions;
  list.hidden = !hasSessions;
  renderCardsMode(list, currentSessions, showDetail);

  syncOpenDetail();
}

/** Keep an open *detail* view (not the settings panel) in sync with new data. */
function syncOpenDetail() {
  const open = document.querySelector(".detail-backdrop[data-session-id]");
  if (!open) return;
  const id = open.dataset.sessionId;
  if (currentSessions.some((s) => s.id === id)) showDetail(id);
  else closeDetail();
}

/** Settings panel: per-type notification toggles (NT-3 / Task 12). */
export async function openSettings() {
  let settings;
  let autostart = false;
  try {
    settings = await invoke("get_settings");
  } catch (_err) {
    settings = { notifications: { waiting: true, error: true, done: true } };
  }
  try {
    autostart = await invoke("get_autostart");
  } catch (_err) {
    autostart = false;
  }
  const n = settings.notifications || {};
  const w = settings.widget || {};
  closeDetail();

  const backdrop = document.createElement("div");
  backdrop.className = "detail-backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const panel = document.createElement("div");
  panel.className = "detail-popover settings-panel";
  panel.innerHTML = `
    <div class="detail-summary">Settings</div>
    <div class="settings-group">Notifications</div>
    <label class="toggle"><input type="checkbox" class="settings-toggle" data-key="waiting" ${n.waiting ? "checked" : ""}/> Waiting for input</label>
    <label class="toggle"><input type="checkbox" class="settings-toggle" data-key="error" ${n.error ? "checked" : ""}/> Errors</label>
    <label class="toggle"><input type="checkbox" class="settings-toggle" data-key="done" ${n.done ? "checked" : ""}/> Task complete</label>
    <div class="settings-group">Widget</div>
    <label class="toggle"><input type="checkbox" class="settings-toggle" data-key="always_on_top" ${w.always_on_top ? "checked" : ""}/> Always on top</label>
    <label class="toggle"><input type="checkbox" class="settings-toggle" data-key="auto_hide" ${w.auto_hide ? "checked" : ""}/> Auto-hide when idle</label>
    <div class="settings-group">General</div>
    <label class="toggle"><input type="checkbox" id="autostart-toggle" ${autostart ? "checked" : ""}/> Start on login</label>
    <button class="detail-close" type="button">Close</button>`;

  const checked = (key) => panel.querySelector(`[data-key="${key}"]`).checked;
  const persist = async () => {
    const next = {
      notifications: {
        waiting: checked("waiting"),
        error: checked("error"),
        done: checked("done"),
      },
      widget: {
        always_on_top: checked("always_on_top"),
        auto_hide: checked("auto_hide"),
      },
    };
    try {
      await invoke("set_settings", { settings: next });
    } catch (_err) {
      /* keep UI responsive even if save fails */
    }
  };
  panel.querySelectorAll(".settings-toggle").forEach((cb) =>
    cb.addEventListener("change", persist),
  );
  panel.querySelector("#autostart-toggle").addEventListener("change", async (e) => {
    try {
      await invoke("set_autostart", { enabled: e.target.checked });
    } catch (_err) {
      e.target.checked = !e.target.checked; // revert on failure
    }
  });
  panel.querySelector(".detail-close").addEventListener("click", () => backdrop.remove());
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
}

/** Show the detail popover for a session (DV-1/DV-3). */
export function showDetail(sessionId) {
  const session = currentSessions.find((s) => s.id === sessionId);
  if (!session) return;
  closeDetail();

  const state = visualKey(session);
  const visual = STATE_VISUALS[state];
  // Sessions that are finished, neglected, unconfirmed, or stalled may be
  // dismissed: DONE, IDLE, DETECTING(pending), or ERROR (GF-106/GF-107 — a
  // stalled session is something the user may want to clear). Only the truly
  // live states (working / waiting-for-you) keep the button hidden so the user
  // can't drop a session that still needs them.
  const canStop =
    session.pending ||
    session.state === "idle" ||
    session.state === "done" ||
    session.state === "error";

  const backdrop = document.createElement("div");
  backdrop.className = "detail-backdrop";
  backdrop.dataset.sessionId = sessionId;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeDetail();
  });

  const popover = document.createElement("div");
  popover.className = `detail-popover state-${state}`;
  popover.innerHTML = `
    <div class="detail-head"><div class="char state-${state}">${characterSvg(state)}</div></div>
    <div class="detail-summary">${escapeHtml(session.summary)}</div>
    <dl class="detail-meta">
      <div><dt>State</dt><dd>${visual.label}</dd></div>
      <div><dt>Project</dt><dd>${escapeHtml(session.project_name)}</dd></div>
      <div><dt>Path</dt><dd class="path">${escapeHtml(session.cwd || "—")}</dd></div>
      <div><dt>Elapsed</dt><dd>${formatElapsed(session.idle_seconds)}</dd></div>
    </dl>
    <button class="detail-close" type="button">Close</button>
    ${canStop ? '<button class="detail-stop" type="button">Stop monitoring</button>' : ""}`;
  popover.querySelector(".detail-close").addEventListener("click", closeDetail);
  const stopBtn = popover.querySelector(".detail-stop");
  if (stopBtn)
    stopBtn.addEventListener("click", async () => {
      // Remove this session from tracking; the backend dismisses it so the poll
      // won't re-seed it until it becomes active again (GF-106).
      try {
        await invoke("dismiss_session", { id: session.id });
      } catch (_err) {
        /* best-effort */
      }
      closeDetail();
    });
  backdrop.appendChild(popover);
  document.body.appendChild(backdrop);
}

export function closeDetail() {
  document.querySelectorAll(".detail-backdrop").forEach((el) => el.remove());
}

async function refresh() {
  try {
    setSessions(await invoke("get_sessions"));
  } catch (_err) {
    setSessions([]);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const emptyChar = document.getElementById("empty-char");
  if (emptyChar) emptyChar.innerHTML = characterSvg("idle");
  const gear = document.getElementById("gear");
  if (gear) gear.addEventListener("click", openSettings);

  // Window controls (WC-6): − hides to tray (restored via tray left-click),
  // × fully quits (Rust `quit_app` → app.exit → hook cleanup).
  const winMin = document.getElementById("win-min");
  if (winMin)
    winMin.addEventListener("click", () => {
      getCurrentWindow()
        .hide()
        .catch(() => {});
    });
  const winClose = document.getElementById("win-close");
  if (winClose)
    winClose.addEventListener("click", () => {
      invoke("quit_app").catch(() => {});
    });

  // Resize support (WC-8): cap max size to 1/4 of the screen + wire handles.
  applyMaxSize();
  wireResizeHandles();

  refresh();
  listen("sessions-update", (event) => setSessions(event.payload));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
});
