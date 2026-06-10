// Animated character mode renderer (Task 33 / GF-112) — Layer 1.
//
// Draws the always-present root Fetchy plus one child per Claude Code session,
// connected by harness leashes (harness.js). Uses **id-key reconcile** (AM-8
// G2): the #stage is never wiped — nodes are created once (spawn), patched in
// place on updates, and removed (despawn) only when their session ends. This
// keeps CSS animations from resetting on every sessions-update and avoids the
// flicker an innerHTML rebuild would cause.

import { characterSvg } from "./character.js";
import { escapeHtml, visualKey } from "./utils.js";
import { buildForest, tierSize } from "./tree.js";
import { ensureHarnessLayer, drawHarness } from "./harness.js";

// id → session-node element, persisted across renders for reconcile.
const nodeEls = new Map();
let rootEl = null;
let onSelectFn = null;

// Root expression reflects the most attention-worthy session state, so the
// parent Fetchy "feels" what its children are doing (idle/napping when none).
const ROOT_PRIORITY = ["waiting", "error", "working", "done", "idle"];
function rootState(sessions) {
  for (const st of ROOT_PRIORITY) {
    if (sessions.some((s) => !s.pending && s.state === st)) return st;
  }
  return "idle";
}

/** Inner markup for a node (bubble + character + title). */
function nodeInnerHTML(role, state, session) {
  const size = tierSize(role);
  const svg = characterSvg(state, { role });
  const bubble =
    session && session.summary
      ? `<div class="thought-bubble">${escapeHtml(session.summary)}</div>`
      : "";
  const titleText = session ? session.project_name : "Claude Code";
  const title = `<div class="node-title">${escapeHtml(titleText)}</div>`;
  return `${bubble}<div class="char-wrap" style="width:${size}px;height:${size}px">${svg}</div>${title}`;
}

/** Create the root node once; it is always shown (AM-2). */
function ensureRoot(stage) {
  if (rootEl && stage.contains(rootEl)) return rootEl;
  rootEl = document.createElement("div");
  rootEl.className = "anim-node anim-root";
  rootEl.dataset.role = "root";
  rootEl.dataset.state = "idle";
  rootEl.innerHTML = nodeInnerHTML("root", "idle", null);
  stage.appendChild(rootEl);
  return rootEl;
}

/** Patch the root's expression when the aggregate state changes. */
function updateRoot(sessions) {
  if (!rootEl) return;
  const state = rootState(sessions);
  if (rootEl.dataset.state !== state) {
    rootEl.dataset.state = state;
    const wrap = rootEl.querySelector(".char-wrap");
    if (wrap) wrap.innerHTML = characterSvg(state, { role: "root" });
  }
}

function createSessionNode(session, stage) {
  const el = document.createElement("div");
  el.className = "anim-node anim-spawn";
  el.dataset.sessionId = session.id;
  el.dataset.role = "session";
  el.dataset.state = visualKey(session);
  el.innerHTML = nodeInnerHTML("session", el.dataset.state, session);
  el.addEventListener("click", () => onSelectFn && onSelectFn(session.id));
  // Drop the spawn class once it finishes so later reconciles don't replay it.
  el.addEventListener("animationend", () => el.classList.remove("anim-spawn"), {
    once: true,
  });
  stage.appendChild(el);
  return el;
}

/** Patch an existing node in place (no innerHTML churn unless the state flips). */
function updateSessionNode(el, session) {
  const state = visualKey(session);
  if (el.dataset.state !== state) {
    el.dataset.state = state;
    const wrap = el.querySelector(".char-wrap");
    if (wrap) wrap.innerHTML = characterSvg(state, { role: "session" });
  }
  // Thought bubble (current work summary, AM-5).
  let bubble = el.querySelector(".thought-bubble");
  if (session.summary) {
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.className = "thought-bubble";
      el.insertBefore(bubble, el.firstChild);
    }
    if (bubble.textContent !== session.summary) bubble.textContent = session.summary;
  } else if (bubble) {
    bubble.remove();
  }
  // Title (project name).
  const title = el.querySelector(".node-title");
  if (title && title.textContent !== session.project_name) {
    title.textContent = session.project_name;
  }
}

/** Despawn: play the exit animation then remove. A timer guarantees removal
 *  even under prefers-reduced-motion (where the animation does not run). */
function despawn(el) {
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.remove();
  };
  el.classList.add("anim-despawn");
  el.addEventListener("animationend", remove, { once: true });
  setTimeout(remove, 420);
}

function positionNode(el, x, y) {
  if (!el) return;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

/** Place the root + children and (re)draw the leashes. */
function layout(stage, forest) {
  const w = stage.clientWidth || 360;
  const h = stage.clientHeight || 400;
  const rootSize = tierSize("root");
  const childSize = tierSize("session");
  const cx = w / 2;
  const rootY = rootSize / 2 + 22;
  positionNode(rootEl, cx, rootY);

  const children = forest.children;
  const links = [];
  if (children.length > 0) {
    const childY = Math.min(h - childSize / 2 - 26, rootY + 130);
    const spacing = w / (children.length + 1);
    children.forEach((child, i) => {
      const el = nodeEls.get(child.id);
      if (!el) return;
      const x = spacing * (i + 1);
      positionNode(el, x, childY);
      links.push({
        from: { x: cx, y: rootY + rootSize / 2 },
        to: { x, y: childY - childSize / 2 },
        session: child.session,
      });
    });
  }
  drawHarness(ensureHarnessLayer(stage), links, w, h);
}

/**
 * Render the animated mode into `stage` from the current snapshot.
 * @param {HTMLElement} stage the #stage element (already visible)
 * @param {Array<object>} sessions current snapshot
 * @param {(id:string)=>void} onSelect opens the detail view (AM-6)
 */
export function renderAnimMode(stage, sessions, onSelect) {
  if (!stage) return;
  onSelectFn = onSelect;
  const list = Array.isArray(sessions) ? sessions : [];
  const forest = buildForest(list);

  ensureRoot(stage);
  ensureHarnessLayer(stage);

  // Reconcile children by id (AM-8 G2): remove gone, create new, patch existing.
  const desired = new Set(list.map((s) => s.id));
  for (const [id, el] of nodeEls) {
    if (!desired.has(id)) {
      despawn(el);
      nodeEls.delete(id);
    }
  }
  for (const s of list) {
    const existing = nodeEls.get(s.id);
    if (existing) updateSessionNode(existing, s);
    else nodeEls.set(s.id, createSessionNode(s, stage));
  }

  updateRoot(list);
  layout(stage, forest);
}
