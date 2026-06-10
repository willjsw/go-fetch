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
let overflowEl = null; // the "+N" cluster node when children don't fit (AM-9)
let onSelectFn = null;
// Kept so the ResizeObserver can re-lay-out without a fresh snapshot (AM-9).
let lastStage = null;
let lastSessions = [];
let resizeObserver = null;

// UI-breakage guard tunables (AM-9): nodes shrink to fit a narrow widget and
// overflow into a "+N" cluster rather than overlapping.
const PAD = 12; // horizontal breathing room on each edge
const GAP = 8; // minimum gap between sibling nodes
const MIN_CHILD = 24; // never shrink a character below this (readability floor)

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

/** Apply a computed character size to a node's char-wrap (AM-9 scale-down). */
function setNodeSize(el, size) {
  const wrap = el && el.querySelector(".char-wrap");
  if (wrap) {
    wrap.style.width = `${size}px`;
    wrap.style.height = `${size}px`;
  }
}

/** The faded "+N" cluster node shown when children don't fit (AM-9). */
function ensureOverflowNode(stage) {
  if (overflowEl && stage.contains(overflowEl)) return overflowEl;
  overflowEl = document.createElement("div");
  overflowEl.className = "anim-node anim-overflow";
  overflowEl.dataset.role = "overflow";
  overflowEl.innerHTML = `<div class="char-wrap">${characterSvg("idle", { role: "session" })}</div><div class="node-title overflow-count">+0</div>`;
  stage.appendChild(overflowEl);
  return overflowEl;
}

/** Re-lay-out on widget resize (AM-9), rAF-debounced to avoid observer loops. */
function ensureResizeObserver(stage) {
  if (resizeObserver || typeof ResizeObserver === "undefined") return;
  let scheduled = false;
  resizeObserver = new ResizeObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (lastStage) layout(lastStage, buildForest(lastSessions));
    });
  });
  resizeObserver.observe(stage);
}

/**
 * Place the root, its session children, and each session's sub-agents (depth-2,
 * GF-108), then (re)draw the leashes. Sessions shrink to fit the (narrow) widget
 * and overflow into a "+N" cluster instead of overlapping (AM-9); the size floor
 * (MIN_CHILD) keeps them readable. Sub-agents render smaller in a row beneath
 * their parent session.
 */
function layout(stage, forest) {
  const w = stage.clientWidth || 360;
  const h = stage.clientHeight || 400;
  const rootSize = tierSize("root");
  const cx = w / 2;
  const rootY = rootSize / 2 + 22;
  positionNode(rootEl, cx, rootY);

  const sessions = forest.children;
  const n = sessions.length;
  const usable = Math.max(MIN_CHILD, w - PAD * 2);

  // How many fit at the readability floor; reserve a slot for "+N" on overflow.
  const maxAtMin = Math.max(1, Math.floor(usable / (MIN_CHILD + GAP)));
  let visible = sessions;
  let overflowCount = 0;
  if (n > maxAtMin) {
    visible = sessions.slice(0, Math.max(1, maxAtMin - 1));
    overflowCount = n - visible.length;
  }

  const slots = visible.length + (overflowCount > 0 ? 1 : 0);
  const maxChild = tierSize("session");
  const childSize =
    slots > 0
      ? Math.max(MIN_CHILD, Math.min(maxChild, Math.floor(usable / slots - GAP)))
      : maxChild;

  const childY = Math.min(h - childSize / 2 - 26, rootY + 124);
  const spacing = w / (slots + 1);
  const fromRoot = { x: cx, y: rootY + rootSize / 2 };
  const links = [];

  // Sub-agent (depth-2) size: smaller than its parent, with its own floor.
  const subSize = Math.max(20, Math.min(tierSize("subagent"), Math.round(childSize * 0.7)));
  const subY = Math.min(h - subSize / 2 - 6, childY + childSize / 2 + subSize / 2 + 18);

  visible.forEach((sess, i) => {
    const el = nodeEls.get(sess.id);
    if (!el) return;
    const x = spacing * (i + 1);
    setNodeSize(el, childSize);
    el.style.setProperty("--bounce-delay", `${(i % 4) * 0.3}s`); // stagger (AM-4)
    positionNode(el, x, childY);
    links.push({ from: fromRoot, to: { x, y: childY - childSize / 2 }, session: sess.session });

    // Place this session's sub-agents in a centered row beneath it (AM-3 / L2).
    const subs = sess.children;
    if (subs.length > 0) {
      const fromSess = { x, y: childY + childSize / 2 };
      const step = subSize + 6;
      const rowW = (subs.length - 1) * step;
      subs.forEach((sub, j) => {
        const subEl = nodeEls.get(sub.id);
        if (!subEl) return;
        const sx = Math.max(subSize / 2, Math.min(w - subSize / 2, x - rowW / 2 + j * step));
        setNodeSize(subEl, subSize);
        subEl.style.setProperty("--bounce-delay", `${(j % 4) * 0.3}s`);
        positionNode(subEl, sx, subY);
        links.push({ from: fromSess, to: { x: sx, y: subY - subSize / 2 }, session: sub.session });
      });
    }
  });

  if (overflowCount > 0) {
    const ov = ensureOverflowNode(stage);
    ov.hidden = false;
    const count = ov.querySelector(".overflow-count");
    if (count) count.textContent = `+${overflowCount}`;
    setNodeSize(ov, childSize);
    const x = spacing * slots;
    positionNode(ov, x, childY);
    links.push({ from: fromRoot, to: { x, y: childY - childSize / 2 }, session: null });
  } else if (overflowEl) {
    overflowEl.hidden = true;
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

  lastStage = stage;
  lastSessions = list;
  ensureRoot(stage);
  ensureHarnessLayer(stage);
  ensureResizeObserver(stage);

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
