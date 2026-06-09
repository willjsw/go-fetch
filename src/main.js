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

const STATE_VISUALS = {
  working: { label: "Working", icon: "⚙" },
  waiting: { label: "Waiting for you", icon: "⏳" },
  error: { label: "Error", icon: "✕" },
  done: { label: "Done", icon: "✓" },
  idle: { label: "Idle", icon: "z" },
};

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
    const state = STATE_VISUALS[session.state] ? session.state : "idle";
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
  try {
    settings = await invoke("get_settings");
  } catch (_err) {
    settings = { notifications: { waiting: true, error: true, done: true } };
  }
  const n = settings.notifications || {};
  closeDetail();

  const backdrop = document.createElement("div");
  backdrop.className = "detail-backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const panel = document.createElement("div");
  panel.className = "detail-popover settings-panel";
  panel.innerHTML = `
    <div class="detail-summary">Notifications</div>
    <label class="toggle"><input type="checkbox" data-key="waiting" ${n.waiting ? "checked" : ""}/> Waiting for input</label>
    <label class="toggle"><input type="checkbox" data-key="error" ${n.error ? "checked" : ""}/> Errors</label>
    <label class="toggle"><input type="checkbox" data-key="done" ${n.done ? "checked" : ""}/> Task complete</label>
    <button class="detail-close" type="button">Close</button>`;

  const persist = async () => {
    const next = {
      notifications: {
        waiting: panel.querySelector('[data-key="waiting"]').checked,
        error: panel.querySelector('[data-key="error"]').checked,
        done: panel.querySelector('[data-key="done"]').checked,
      },
    };
    try {
      await invoke("set_settings", { settings: next });
    } catch (_err) {
      /* keep UI responsive even if save fails */
    }
  };
  panel.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
    cb.addEventListener("change", persist),
  );
  panel.querySelector(".detail-close").addEventListener("click", () => backdrop.remove());
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
}

/** Show the detail popover for a session (DV-1/DV-3). */
function showDetail(sessionId) {
  const session = currentSessions.find((s) => s.id === sessionId);
  if (!session) return;
  closeDetail();

  const state = STATE_VISUALS[session.state] ? session.state : "idle";
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
  refresh();
  listen("sessions-update", (event) => renderSessions(event.payload));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
});
