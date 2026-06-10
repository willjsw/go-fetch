// Cards mode renderer (Task 30 / GF-109).
//
// The original vertical session-card list, lifted out of main.js so the widget
// can dispatch between this and the animated mode (GF-110+) from one store.
// Behavior is preserved exactly: one card per session, colored/labelled by
// state, click opens the detail popover via the injected `onSelect` callback
// (kept as a parameter so this module never imports back into main.js).

import { characterSvg } from "./character.js";
import { STATE_VISUALS, visualKey, escapeHtml, formatElapsed } from "./utils.js";

/**
 * Render the session cards into `listEl`.
 * @param {HTMLElement} listEl the `#sessions` container
 * @param {Array<object>} sessions current session snapshot
 * @param {(id: string) => void} onSelect called with a session id on card click
 */
export function renderCardsMode(listEl, sessions, onSelect) {
  if (!listEl) return;
  listEl.innerHTML = "";

  for (const session of sessions) {
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
    card.addEventListener("click", () => onSelect(session.id));
    listEl.appendChild(card);
  }
}
