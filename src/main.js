// GoFetch widget frontend — store ↔ renderer split (Task 30 / GF-109).
//
// Receives session snapshots from the Rust backend over Tauri IPC and keeps them
// in a single store (`currentSessions`). A mode dispatcher (`renderActiveMode`)
// draws the snapshot via the active mode's renderer — today the card list
// (cards-mode.js), with the animated character mode wired in GF-110+. Clicking a
// session opens a detail popover with the (Rust-generated, local-only) one-line
// summary plus state, project, path, and elapsed time (DV-1/DV-3).

import { STATE_COLOR } from "./character-spec.js";
import { SpriteAnimator } from "./sprite-engine.js";
import { activeSheet, activeCharacter, setCharacter, onCharacterChange } from "./character-store.js";
import { BACKGROUND_LABELS, activeBackground, setBackground, applyBackground } from "./background-store.js";
import { CHARACTER_LABELS } from "./sprites/index.js";
import { renderCardsMode } from "./cards-mode.js";
import { renderAnimMode } from "./anim-mode.js";
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
    // (410×600, WC-12). The width floor (410) also matches minWidth so the max
    // can't fall under the resize floor on small screens; min height is 400.
    const maxW = Math.max(410, Math.floor(logW * 0.5));
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
/** localStorage key for the persisted view mode (GF-110). */
const MODE_KEY = "gofetch:mode";
/** Active render mode: 'cards' (default) | 'anim'. Restored from localStorage. */
let currentMode = (() => {
  try {
    return localStorage.getItem(MODE_KEY) === "anim" ? "anim" : "cards";
  } catch (_err) {
    return "cards";
  }
})();

/** Replace the store snapshot and schedule a coalesced repaint. */
function setSessions(sessions) {
  currentSessions = Array.isArray(sessions) ? sessions : [];
  scheduleRender();
}

let rafPending = false;
/**
 * Coalesce rapid `sessions-update` events into one paint per frame (AM-8 G2):
 * the backend pushes a snapshot on every hook, so a busy session could
 * otherwise repaint several times per frame.
 */
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderActiveMode();
  });
}

/** Switch the active render mode, persist it, and repaint (mode tabs, GF-110). */
export function setMode(mode) {
  currentMode = mode === "anim" ? "anim" : "cards";
  try {
    localStorage.setItem(MODE_KEY, currentMode);
  } catch (_err) {
    /* persistence is best-effort */
  }
  renderActiveMode();
}

/**
 * Paint the current store snapshot using the active mode's renderer. In cards
 * mode an empty list shows the empty state (DI-6); in animated mode the stage
 * takes over and the root Fetchy is always shown — even with zero sessions
 * (AM-2).
 */
function renderActiveMode() {
  const empty = document.getElementById("empty-state");
  const list = document.getElementById("sessions");
  const stage = document.getElementById("stage");
  if (!empty || !list) return;

  updateTabUI();

  if (currentMode === "anim") {
    empty.hidden = true;
    list.hidden = true;
    if (stage) {
      stage.hidden = false;
      renderAnimMode(stage, currentSessions, showDetail);
    }
  } else {
    if (stage) stage.hidden = true;
    // Cards mode lists top-level sessions only, but receives the FULL snapshot:
    // sub-agent nodes (Layer 2) become green running-dots on their parent's
    // card (GF-129) instead of separate cards.
    const topLevel = currentSessions.filter((s) => !s.parent_session_id);
    const hasSessions = topLevel.length > 0;
    empty.hidden = hasSessions;
    list.hidden = !hasSessions;
    renderCardsMode(list, currentSessions, showDetail);
  }

  syncOpenDetail();
}

/** Reflect the active mode on the tab buttons (.active + aria-selected). */
function updateTabUI() {
  document.querySelectorAll(".mode-tab").forEach((btn) => {
    const active = btn.dataset.mode === currentMode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
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
    <div class="settings-group">Character</div>
    <label class="toggle">Character
      <select id="character-select" class="char-select">
        ${CHARACTER_LABELS.map(
          ([id, label]) =>
            `<option value="${id}" ${id === activeCharacter() ? "selected" : ""}>${label}</option>`,
        ).join("")}
      </select>
    </label>
    <label class="toggle">Background
      <select id="background-select" class="char-select">
        ${BACKGROUND_LABELS.map(
          ([id, label]) =>
            `<option value="${id}" ${id === activeBackground() ? "selected" : ""}>${label}</option>`,
        ).join("")}
      </select>
    </label>
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
  panel.querySelector("#character-select").addEventListener("change", (e) => {
    setCharacter(e.target.value);
  });
  panel.querySelector("#background-select").addEventListener("change", (e) => {
    setBackground(e.target.value);
  });
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
    <div class="detail-head"><div class="char state-${state}"></div></div>
    <div class="detail-summary">${escapeHtml(session.summary)}</div>
    <dl class="detail-meta">
      <div><dt>State</dt><dd>${visual.label}</dd></div>
      <div><dt>Project</dt><dd>${escapeHtml(session.project_name)}</dd></div>
      <div><dt>Path</dt><dd class="path">${escapeHtml(session.cwd || "—")}</dd></div>
      <div><dt>Elapsed</dt><dd>${formatElapsed(session.idle_seconds)}</dd></div>
    </dl>
    <button class="detail-close" type="button">Close</button>
    ${canStop ? '<button class="detail-stop" type="button">Stop monitoring</button>' : ""}`;
  // Live sprite in the popover head — destroyed by closeDetail (GF-116).
  const sheet = activeSheet();
  detailSprite = new SpriteAnimator(popover.querySelector(".detail-head .char"), sheet);
  detailSprite.setAnim(sheet.stateAnims[state] || "idle", STATE_COLOR[state]);
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

/** Animator for the open detail popover's character (null when closed). */
let detailSprite = null;

export function closeDetail() {
  if (detailSprite) {
    detailSprite.destroy();
    detailSprite = null;
  }
  document.querySelectorAll(".detail-backdrop").forEach((el) => el.remove());
}

async function refresh() {
  try {
    setSessions(await invoke("get_sessions"));
  } catch (_err) {
    setSessions([]);
  }
}

/** Empty-state character: rebuilt whenever the character changes (GF-118). */
let emptySprite = null;
function mountEmptyChar() {
  const emptyChar = document.getElementById("empty-char");
  if (!emptyChar) return;
  if (emptySprite) emptySprite.destroy();
  const sheet = activeSheet();
  emptySprite = new SpriteAnimator(emptyChar, sheet);
  emptySprite.setAnim(sheet.stateAnims.idle || "idle", STATE_COLOR.idle);
}

window.addEventListener("DOMContentLoaded", () => {
  // The empty-state character naps with a live sprite too (GF-116). The
  // animator lives until a character switch; the ticker pauses it when hidden.
  mountEmptyChar();

  // Restore the persisted stage background (GF-128).
  applyBackground();

  // Character switch (GF-118): cards/stage tear down via their own hooks —
  // here we rebuild the empty-state sprite and repaint the active mode. Only a
  // session detail is closed (its sprite holds the old sheet); the settings
  // panel stays open so the user can keep browsing characters.
  onCharacterChange(() => {
    mountEmptyChar();
    const open = document.querySelector(".detail-backdrop[data-session-id]");
    if (open) {
      if (detailSprite) {
        detailSprite.destroy();
        detailSprite = null;
      }
      open.remove();
    }
    renderActiveMode();
  });
  const gear = document.getElementById("gear");
  if (gear) gear.addEventListener("click", openSettings);

  // Mode tabs (GF-110): switch view + persist the choice.
  document.querySelectorAll(".mode-tab").forEach((btn) =>
    btn.addEventListener("click", () => setMode(btn.dataset.mode)),
  );

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

  // Pause all animation while the window is hidden/minimized (G1 perf): the
  // ambient app must not burn CPU/battery when the user isn't looking.
  const applyPaused = () =>
    document.body.classList.toggle("gf-paused", document.hidden);
  document.addEventListener("visibilitychange", applyPaused);
  applyPaused();

  refresh();
  listen("sessions-update", (event) => setSessions(event.payload));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
});
