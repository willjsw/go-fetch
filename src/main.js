// GoFetch widget frontend — v1 scaffold (Task 2 / GF-2).
//
// For now this only renders the empty state defined in index.html. Later tasks
// wire this up to the Rust backend over Tauri IPC (events emitted by the
// session state machine) and replace the placeholder with the pixel-art
// character. Tauri globals are available via `window.__TAURI__`
// (withGlobalTauri = true).

const emptyStateEl = () => document.getElementById("empty-state");
const sessionsEl = () => document.getElementById("sessions");

/**
 * Render the list of sessions. With an empty list we show the empty state
 * (DI-6) so that "no data" is never mistaken for an error.
 * @param {Array<object>} sessions
 */
function renderSessions(sessions = []) {
  const empty = emptyStateEl();
  const list = sessionsEl();
  if (!empty || !list) return;

  const hasSessions = Array.isArray(sessions) && sessions.length > 0;
  empty.hidden = hasSessions;
  list.hidden = !hasSessions;
  // Session card rendering is implemented in Task 5 (Placeholder UI).
}

window.addEventListener("DOMContentLoaded", () => {
  renderSessions([]);
});
