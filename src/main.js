// GoFetch widget frontend — Task 5 (GF-10): visualize session state.
//
// Receives session snapshots from the Rust backend over Tauri IPC and renders
// one placeholder "character" card per session, colored/labelled by state. The
// real pixel-art character replaces the placeholder in Task 11 (GF-16); the
// click-through one-line summary is expanded in Task 10 (GF-15). Tauri globals
// are available via `window.__TAURI__` (withGlobalTauri = true).

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// State key (lowercased enum from Rust) → display visuals.
const STATE_VISUALS = {
  working: { label: "Working", icon: "⚙" },
  waiting: { label: "Waiting for you", icon: "⏳" },
  error: { label: "Error", icon: "✕" },
  done: { label: "Done", icon: "✓" },
  idle: { label: "Idle", icon: "z" },
};

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Short, glanceable hint per state (the full summary is Task 10). */
function summarize(session) {
  switch (session.state) {
    case "working":
      return session.last_tool ? `using ${session.last_tool}` : "working";
    case "waiting":
      return session.waiting_kind === "permission_prompt"
        ? "needs permission"
        : "needs your prompt";
    case "error":
      return session.error_type || "stalled";
    default:
      return "";
  }
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
 * Render the session list. An empty list shows the empty state (DI-6) so that
 * "no data" is never mistaken for an error.
 * @param {Array<object>} sessions
 */
function renderSessions(sessions = []) {
  const empty = document.getElementById("empty-state");
  const list = document.getElementById("sessions");
  if (!empty || !list) return;

  const hasSessions = Array.isArray(sessions) && sessions.length > 0;
  empty.hidden = hasSessions;
  list.hidden = !hasSessions;
  list.innerHTML = "";

  for (const session of sessions) {
    const state = STATE_VISUALS[session.state] ? session.state : "idle";
    const visual = STATE_VISUALS[state];

    const card = document.createElement("div");
    card.className = `session-card state-${state}`;
    card.innerHTML = `
      <div class="char state-${state}" aria-hidden="true">
        <span class="char-icon">${visual.icon}</span>
      </div>
      <div class="meta">
        <div class="project" title="${escapeHtml(session.cwd || "")}">${escapeHtml(session.project_name)}</div>
        <div class="state-line">
          <span class="state-label">${visual.label}</span>
          <span class="hint">${escapeHtml(summarize(session))}</span>
        </div>
        <div class="elapsed">${formatElapsed(session.idle_seconds)}</div>
      </div>`;
    list.appendChild(card);
  }
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
  // Live updates pushed by the backend on every state change / idle transition.
  listen("sessions-update", (event) => renderSessions(event.payload));
});
