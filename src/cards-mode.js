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
import { activeSheet, onCharacterChange } from "./character-store.js";
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
    </div>
    <div class="agent-stack" aria-hidden="true" hidden>
      <div class="agent-dots"></div>
      <div class="agent-count"></div>
    </div>`;
  card.addEventListener("click", () => onSelect(session.id));
  const sprite = new SpriteAnimator(card.querySelector(".char"), activeSheet());
  return { el: card, sprite, state: null, inactive: undefined, agents: 0 };
}

/** Cards can't nest sub-agent characters like the stage does, so each card
 *  shows one small green dot per RUNNING sub-agent (GF-129) with the exact
 *  count as text right below ("8 agents", GF-139). The dot grid is capped so
 *  any count keeps the card layout intact — the text carries the precise
 *  number. Counts come from the live snapshot — a sub-agent node exists
 *  exactly while it runs (removed on SubagentStop/eviction) — so this is
 *  real-time. */
const MAX_AGENT_DOTS = 6;
function patchAgentDots(entry, count) {
  if (entry.agents === count) return;
  entry.agents = count;
  const stack = entry.el.querySelector(".agent-stack");
  if (!stack) return;
  stack.hidden = count === 0;
  const dotsBox = stack.querySelector(".agent-dots");
  const countBox = stack.querySelector(".agent-count");
  if (count === 0) {
    dotsBox.innerHTML = "";
    countBox.textContent = "";
    return;
  }
  const dots = Math.min(count, MAX_AGENT_DOTS);
  let html = "";
  for (let i = 0; i < dots; i++) html += '<span class="agent-dot"></span>';
  dotsBox.innerHTML = html;
  countBox.textContent = `${count} agent${count === 1 ? "" : "s"}`;
  entry.el.title = `Click for details — ${count} sub-agent${count === 1 ? "" : "s"} running`;
}

// Character switch (GF-118): drop every card; the next render rebuilds them
// with the new sheet.
onCharacterChange(() => {
  for (const entry of cards.values()) {
    entry.sprite.destroy();
    entry.el.remove();
  }
  cards.clear();
});

function patchCard(entry, session) {
  const state = visualKey(session);
  const visual = STATE_VISUALS[state];
  if (entry.state !== state) {
    entry.state = state;
    entry.el.className = `session-card state-${state}`;
    entry.inactive = undefined; // className reset dropped the modifier; re-apply
    entry.sprite.setAnim(activeSheet().stateAnims[state] || "idle", STATE_COLOR[state]);
  }
  // Visual-only "inactive" hint on a Working session (interrupt / IDE-permission
  // blind spot). Toggled independently of state changes; state stays `working`.
  if (entry.inactive !== session.inactive) {
    entry.inactive = session.inactive;
    entry.el.classList.toggle("inactive", !!session.inactive);
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
 * Render the session cards into `listEl`. Receives the FULL snapshot (top-level
 * sessions and sub-agent nodes): cards are rendered for top-level sessions
 * only, and each card shows its running sub-agents as green dots (GF-129).
 * @param {HTMLElement} listEl the `#sessions` container
 * @param {Array<object>} sessions current session snapshot (full, incl. sub-agents)
 * @param {(id: string) => void} onSelect called with a session id on card click
 */
export function renderCardsMode(listEl, sessions, onSelect) {
  if (!listEl) return;

  const topLevel = sessions.filter((s) => !s.parent_session_id);
  const agentCounts = new Map();
  for (const s of sessions) {
    if (!s.parent_session_id) continue;
    agentCounts.set(s.parent_session_id, (agentCounts.get(s.parent_session_id) || 0) + 1);
  }

  const desired = new Set(topLevel.map((s) => s.id));
  for (const [id, entry] of cards) {
    if (!desired.has(id)) {
      entry.sprite.destroy();
      entry.el.remove();
      cards.delete(id);
    }
  }

  topLevel.forEach((session, i) => {
    let entry = cards.get(session.id);
    if (!entry) {
      entry = makeCard(session, onSelect);
      cards.set(session.id, entry);
    }
    patchCard(entry, session);
    patchAgentDots(entry, agentCounts.get(session.id) || 0);
    // Keep DOM order in sync with the snapshot order.
    const at = listEl.children[i];
    if (at !== entry.el) listEl.insertBefore(entry.el, at || null);
  });
}
