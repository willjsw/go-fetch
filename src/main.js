// GoFetch widget frontend — Task 5 (GF-10) state visualization +
// Task 10 (GF-15) click-through one-line summary detail view.
//
// Receives session snapshots from the Rust backend over Tauri IPC and renders
// one placeholder "character" card per session, colored/labelled by state.
// Clicking a card opens a detail popover with the (Rust-generated, local-only)
// one-line summary plus state, project, path, and elapsed time (DV-1/DV-3).
// The real pixel-art character replaces the placeholder in Task 11 (GF-16).

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
      <div class="char state-${state}" aria-hidden="true">
        <span class="char-icon">${visual.icon}</span>
      </div>
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

  // Keep an open detail view in sync with the latest data.
  const open = document.querySelector(".detail-backdrop");
  if (open) {
    const id = open.dataset.sessionId;
    if (currentSessions.some((s) => s.id === id)) showDetail(id);
    else closeDetail();
  }
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
  refresh();
  listen("sessions-update", (event) => renderSessions(event.payload));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
});
