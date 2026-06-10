// Cards mode renderer (Task 30 / GF-109; live sprites GF-116).
//
// The vertical session-card list. Cards are id-key reconciled (same pattern as
// the animated stage): created once per session, patched in place, removed when
// the session ends — so the frame-based character on each card keeps animating
// across the frequent `sessions-update` snapshots instead of resetting to
// frame 0 on every rebuild. Click opens the detail popover via the injected
// `onSelect` callback.

import { STATE_COLOR } from "./character-spec.js";
import { SpriteAnimator } from "./sprite-engine.js";
import dogSheet from "./sprites/dog.js";
import { STATE_VISUALS, visualKey, formatElapsed } from "./utils.js";

/** session id → { el, sprite, state } persisted across renders. */
const cards = new Map();

function makeCard(session, onSelect) {
  const card = document.createElement("div");
  card.dataset.sessionId = session.id;
  card.title = "Click for details";
  card.innerHTML = `
    <div class="char" aria-hidden="true"></div>
    <div class="meta">
      <div class="project"></div>
      <div class="state-line">
        <span class="state-label"></span>
        <span class="hint"></span>
      </div>
      <div class="elapsed"></div>
    </div>`;
  card.addEventListener("click", () => onSelect(session.id));
  const sprite = new SpriteAnimator(card.querySelector(".char"), dogSheet);
  return { el: card, sprite, state: null };
}

function patchCard(entry, session) {
  const state = visualKey(session);
  const visual = STATE_VISUALS[state];
  if (entry.state !== state) {
    entry.state = state;
    entry.el.className = `session-card state-${state}`;
    entry.sprite.setAnim(dogSheet.stateAnims[state] || "idle", STATE_COLOR[state]);
  }
  const set = (sel, text) => {
    const el = entry.el.querySelector(sel);
    if (el && el.textContent !== text) el.textContent = text;
  };
  set(".project", session.project_name);
  set(".state-label", visual.label);
  set(".hint", session.summary);
  set(".elapsed", formatElapsed(session.idle_seconds));
}

/**
 * Render the session cards into `listEl`.
 * @param {HTMLElement} listEl the `#sessions` container
 * @param {Array<object>} sessions current session snapshot
 * @param {(id: string) => void} onSelect called with a session id on card click
 */
export function renderCardsMode(listEl, sessions, onSelect) {
  if (!listEl) return;

  const desired = new Set(sessions.map((s) => s.id));
  for (const [id, entry] of cards) {
    if (!desired.has(id)) {
      entry.sprite.destroy();
      entry.el.remove();
      cards.delete(id);
    }
  }

  sessions.forEach((session, i) => {
    let entry = cards.get(session.id);
    if (!entry) {
      entry = makeCard(session, onSelect);
      cards.set(session.id, entry);
    }
    patchCard(entry, session);
    // Keep DOM order in sync with the snapshot order.
    const at = listEl.children[i];
    if (at !== entry.el) listEl.insertBefore(entry.el, at || null);
  });
}
