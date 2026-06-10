// GoFetch widget frontend — Task 5 (GF-10) state visualization +
// Task 10 (GF-15) click-through one-line summary detail view.
//
// Receives session snapshots from the Rust backend over Tauri IPC and renders
// one placeholder "character" card per session, colored/labelled by state.
// Clicking a card opens a detail popover with the (Rust-generated, local-only)
// one-line summary plus state, project, path, and elapsed time (DV-1/DV-3).
// The real pixel-art character replaces the placeholder in Task 11 (GF-16).

import { characterSvg } from "./character.js";

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
    const maxW = Math.max(180, Math.floor(logW * 0.5));
    const maxH = Math.max(220, Math.floor(logH * 0.5));
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

const STATE_VISUALS = {
  working: { label: "Working", icon: "⚙" },
  waiting: { label: "Waiting for you", icon: "⏳" },
  error: { label: "Error", icon: "✕" },
  done: { label: "Done", icon: "✓" },
  idle: { label: "Idle", icon: "z" },
  // SL-5: detected (e.g. pre-existing / just started) but state unconfirmed.
  pending: { label: "Detecting…", icon: "?" },
};

/**
 * Visual key for a session: a `pending` session (polling-seeded or just
 * started, SL-5) shows the neutral "?" expression regardless of its underlying
 * placeholder state; otherwise the mapped state (fallback `idle`).
 */
function visualKey(session) {
  if (session && session.pending) return "pending";
  return STATE_VISUALS[session.state] ? session.state : "idle";
}

// Latest snapshot, kept so a card click can look its session up by id.
let currentSessions = [];

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Format elapsed-since-last-activity seconds compactly. */
function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Render the session list. An empty list shows the empty state (DI-6).
 * @param {Array<object>} sessions
 */
function renderSessions(sessions = []) {
  currentSessions = Array.isArray(sessions) ? sessions : [];
  const empty = document.getElementById("empty-state");
  const list = document.getElementById("sessions");
  if (!empty || !list) return;

  const hasSessions = currentSessions.length > 0;
  empty.hidden = hasSessions;
  list.hidden = !hasSessions;
  list.innerHTML = "";

  for (const session of currentSessions) {
    const state = visualKey(session);
    const visual = STATE_VISUALS[state];

    const card = document.createElement("div");
    card.className = `session-card state-${state}`;
    card.dataset.sessionId = session.id;
    card.title = "Click for details";
    card.innerHTML = `
      <div class="char state-${state}" aria-hidden="true">${characterSvg(state)}</div>
      <div class="meta">
        <div class="project">${escapeHtml(session.project_name)}</div>
        <div class="state-line">
          <span class="state-label">${visual.label}</span>
          <span class="hint">${escapeHtml(session.summary)}</span>
        </div>
        <div class="elapsed">${formatElapsed(session.idle_seconds)}</div>
      </div>`;
    card.addEventListener("click", () => showDetail(session.id));
    list.appendChild(card);
  }

  // Keep an open *detail* view (not the settings panel) in sync with new data.
  const open = document.querySelector(".detail-backdrop[data-session-id]");
  if (open) {
    const id = open.dataset.sessionId;
    if (currentSessions.some((s) => s.id === id)) showDetail(id);
    else closeDetail();
  }
}

/** Settings panel: per-type notification toggles (NT-3 / Task 12). */
async function openSettings() {
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
function showDetail(sessionId) {
  const session = currentSessions.find((s) => s.id === sessionId);
  if (!session) return;
  closeDetail();

  const state = visualKey(session);
  const visual = STATE_VISUALS[state];

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
    <button class="detail-close" type="button">Close</button>`;
  popover.querySelector(".detail-close").addEventListener("click", closeDetail);
  backdrop.appendChild(popover);
  document.body.appendChild(backdrop);
}

function closeDetail() {
  document.querySelectorAll(".detail-backdrop").forEach((el) => el.remove());
}

async function refresh() {
  try {
    renderSessions(await invoke("get_sessions"));
  } catch (_err) {
    renderSessions([]);
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
  listen("sessions-update", (event) => renderSessions(event.payload));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
});
