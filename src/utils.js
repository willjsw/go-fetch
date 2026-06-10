// Shared presentation helpers used by every render mode (Task 30 / GF-109).
//
// Extracted from main.js so both the card list (cards-mode.js) and the upcoming
// animated mode can share one source of truth for state labels and formatting.
// Pure functions only — no Tauri / DOM-global dependencies.

export const STATE_VISUALS = {
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
export function visualKey(session) {
  if (session && session.pending) return "pending";
  return STATE_VISUALS[session.state] ? session.state : "idle";
}

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Format elapsed-since-last-activity seconds compactly. */
export function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
