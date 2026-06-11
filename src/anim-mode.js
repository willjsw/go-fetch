// Animated character mode — free-roaming pseudo-3D stage (GF-116).
//
// Characters live on a logical floor plane: position is (u, v) with u ∈ [0,1]
// across the stage and v ∈ [0,1] in DEPTH (0 = far, 1 = near). Projection maps
// depth to screen y, sprite scale, and z-index, so dogs further "back" draw
// smaller, higher, and behind — a 3D composition while every sprite stays flat
// 2D pixel art. Each character strolls (유유히 산책) under a per-state behavior
// table, children stay leashed near their parent (the relation reads without a
// fixed layout), a separation pass keeps nodes from overlapping, and the user
// can pick a character up and drop it anywhere (drag = move, click = detail).
//
// Reconcile stays id-keyed (AM-8 G2): nodes spawn once, are patched in place,
// and despawn when their session ends — logical (u,v) positions survive both
// resizes (relative coords) and re-renders.

import { STATE_COLOR, SIZE_TIERS } from "./character-spec.js";
import { SpriteAnimator } from "./sprite-engine.js";
import { activeSheet, onCharacterChange } from "./character-store.js";
import { escapeHtml, visualKey } from "./utils.js";
import { buildForest } from "./tree.js";
import { ensureHarnessLayer, drawHarness } from "./harness.js";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const PAD_X = 14; // px breathing room at the stage's left/right edges
const PAD_TOP = 64; // px above the far floor edge (room for bubbles/titles)
const PAD_BOTTOM = 30; // px below the near floor edge (room for titles)
const MIN_CHILD = 24; // density floor: never shrink a session sprite below this
const GAP = 8;
const SCALE_FAR = 0.62; // sprite scale at v=0 (back of the floor)
const SCALE_NEAR = 1.12; // sprite scale at v=1 (front of the floor)
const LEASH_SESSION = 0.42; // how far a session may wander from the root (u/v units)
const LEASH_SUB = 0.2; // how far a sub-agent may wander from its session
const LEASH_ANCHOR = 0.22; // leash attach height as a fraction of sprite size (GF-125)
const DRAG_THRESHOLD = 5; // px of pointer travel before a click becomes a drag

/** Per-state stroll personality: what to do on arrival, for how long, and how
 *  far the next hop goes. Speeds are in floor-units/second. States that need
 *  the USER's attention (waiting / error / done) pin in place — `roam: false`
 *  means the dog stops strolling entirely and acts out its motion where it
 *  stands, so the signal can't wander out of the corner of your eye. */
const BEHAVIOR = {
  working: { act: 3.5, actVar: 3.5, hop: 0.1, speed: 0.1, roam: true }, // digs long, short hops
  waiting: { act: 2.5, actVar: 2.5, hop: 0.07, speed: 0.08, roam: false }, // spins in place
  error: { act: 2.0, actVar: 2.0, hop: 0.09, speed: 0.12, roam: false }, // growls in place
  done: { act: 1.6, actVar: 1.4, hop: 0.22, speed: 0.14, roam: false }, // shows off the bone in place
  idle: { act: 8.0, actVar: 8.0, hop: 0.08, speed: 0.05, roam: true }, // sleeps, rarely relocates
  pending: { act: 2.0, actVar: 2.0, hop: 0.12, speed: 0.08, roam: true }, // wanders, looking around
};
const ROOT_SPEED = 0.05; // the big dog strolls slowly, stately

const ROOT_PRIORITY = ["waiting", "error", "working", "done", "idle"];
function rootState(sessions) {
  for (const st of ROOT_PRIORITY) {
    if (sessions.some((s) => !s.pending && s.state === st)) return st;
  }
  return "idle";
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** id → entity. An entity owns its DOM node, sprite animator, and floor state. */
const entities = new Map();
const ROOT_ID = "__root__";
const OVERFLOW_ID = "__overflow__";

let stageEl = null;
let harnessSvg = null;
let onSelectFn = null;
let rafId = null;
let lastTick = 0;
let resizeObserver = null;

const reducedMotion =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

function makeNodeEl(role, session) {
  const el = document.createElement("div");
  el.className = "anim-node anim-spawn";
  el.dataset.role = role;
  const bubble = session && session.summary ? `<div class="thought-bubble"></div>` : "";
  const title = role === "overflow" ? "+0" : session ? session.project_name : "Claude Code";
  el.innerHTML = `${bubble}<div class="char-wrap"></div><div class="node-title${role === "overflow" ? " overflow-count" : ""}">${escapeHtml(title)}</div>`;
  el.addEventListener("animationend", () => el.classList.remove("anim-spawn"), {
    once: true,
  });
  return el;
}

function makeEntity(id, role, session, parent) {
  // Spawn near the parent (or stage center for the root) with a small scatter.
  const pu = parent ? parent.u : 0.5;
  const pv = parent ? parent.v : 0.45;
  const u = clamp01(pu + (Math.random() - 0.5) * 0.3);
  const v = clamp01(pv + (Math.random() - 0.5) * 0.3);
  const el = makeNodeEl(role, session);
  const ent = {
    id,
    role,
    el,
    session,
    parentId: parent ? parent.id : null,
    state: "idle",
    u,
    v,
    tu: u,
    tv: v,
    mode: "act", // "stroll" | "act" | "held"
    modeLeft: rand(0.5, 1.5), // seconds left in the current mode
    facing: Math.random() < 0.5,
    held: false,
    dragMoved: false,
    sprite: null,
  };
  const sheet = activeSheet();
  ent.wrapEl = el.querySelector(".char-wrap");
  ent.sprite = new SpriteAnimator(ent.wrapEl, sheet, {
    // The collar marks the root: collar pixels are baked into every pose and
    // rendered in coat color for everyone else — only the root palette turns
    // them red (sheets without rootPalette simply look the same).
    palette: role === "root" ? sheet.rootPalette : null,
  });
  el.dataset.state = ent.state;
  applyAnim(ent);
  wirePointer(ent);
  stageEl.appendChild(el);
  entities.set(id, ent);
  return ent;
}

function destroyEntity(ent) {
  entities.delete(ent.id);
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    ent.sprite.destroy();
    ent.el.remove();
  };
  ent.el.classList.add("anim-despawn");
  ent.el.addEventListener("animationend", remove, { once: true });
  setTimeout(remove, 420);
}

/** Patch session-derived bits (state, bubble, title) without rebuilding DOM. */
function updateEntity(ent, session) {
  ent.session = session;
  const state = session ? visualKey(session) : ent.state;
  setEntityState(ent, state);

  let bubble = ent.el.querySelector(".thought-bubble");
  const summary = session ? session.summary : "";
  if (summary) {
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.className = "thought-bubble";
      ent.el.insertBefore(bubble, ent.el.firstChild);
    }
    if (bubble.textContent !== summary) bubble.textContent = summary;
  } else if (bubble) {
    bubble.remove();
  }
  const title = ent.el.querySelector(".node-title");
  const titleText = session ? session.project_name : "Claude Code";
  if (ent.role !== "overflow" && title && title.textContent !== titleText) {
    title.textContent = titleText;
  }
}

function setEntityState(ent, state) {
  const key = STATE_COLOR[state] ? state : "idle";
  if (ent.state === key) return;
  ent.state = key;
  ent.el.dataset.state = key;
  const b = behaviorOf(ent);
  if (!b.roam && ent.mode !== "held") {
    // Attention states (waiting/error/done) pin immediately: stop mid-stroll
    // and act the new motion where the dog stands.
    ent.mode = "act";
    ent.modeLeft = b.act;
  } else if (ent.mode === "act") {
    // A state flip interrupts whatever the dog was doing: act out the new
    // state promptly (a finished dig → fetch should be immediate).
    ent.modeLeft = Math.min(ent.modeLeft, 0.3);
  }
  applyAnim(ent);
}

/** Choose the sprite animation for the entity's current mode + state. */
function applyAnim(ent) {
  const color = STATE_COLOR[ent.state];
  const sheet = activeSheet();
  if (ent.mode === "stroll") {
    const du = ent.tu - ent.u;
    const dv = ent.tv - ent.v;
    // A sheet may override how a state MOVES (e.g. the robot flies as a UFO
    // while working) — otherwise pick a directional walk.
    const override = sheet.moveAnims && sheet.moveAnims[ent.state];
    if (override) {
      ent.sprite.setAnim(override, color);
      ent.facing = du < 0;
      ent.sprite.setFlip(ent.facing);
    } else if (Math.abs(dv) > Math.abs(du) * 1.6) {
      ent.sprite.setAnim(dv > 0 ? "walkFront" : "walkBack", color);
      ent.sprite.setFlip(false);
    } else {
      ent.sprite.setAnim("walk", color);
      ent.facing = du < 0;
      ent.sprite.setFlip(ent.facing);
    }
  } else {
    ent.sprite.setAnim(sheet.stateAnims[ent.state] || "idle", color);
    ent.sprite.setFlip(ent.facing);
  }
}

// Character switch (GF-118): tear every entity down immediately — the next
// render rebuilds the cast with the new sheet at the same logical positions
// being lost is fine; they re-scatter around their parents.
onCharacterChange(() => {
  for (const ent of entities.values()) {
    ent.sprite.destroy();
    ent.el.remove();
  }
  entities.clear();
});

// ---------------------------------------------------------------------------
// Behavior (per-frame)
// ---------------------------------------------------------------------------

function rand(min, max) {
  return min + Math.random() * (max - min);
}
function clamp01(x) {
  return Math.max(0.02, Math.min(0.98, x));
}

function leashOf(ent) {
  return ent.role === "subagent" ? LEASH_SUB : LEASH_SESSION;
}

/** Stroll personality for an entity — the sheet may override per state (the
 *  robot-UFO zips around while working; a dog digs mostly in place). */
function behaviorOf(ent) {
  const base = BEHAVIOR[ent.state] || BEHAVIOR.idle;
  const sheet = activeSheet();
  const override = sheet.behavior && sheet.behavior[ent.state];
  return override ? { ...base, ...override } : base;
}

/** Pick the next stroll target: a hop in a random direction, biased back inside
 *  the leash radius around the parent so children orbit their parent. */
function pickTarget(ent) {
  const b = behaviorOf(ent);
  const parent = ent.parentId ? entities.get(ent.parentId) : null;
  let cu = ent.u;
  let cv = ent.v;
  if (parent) {
    const du = ent.u - parent.u;
    const dv = ent.v - parent.v;
    const dist = Math.hypot(du, dv);
    const leash = leashOf(ent);
    if (dist > leash) {
      // Outside the leash — head back toward the parent's side.
      ent.tu = clamp01(parent.u + (du / (dist || 1)) * leash * 0.6);
      ent.tv = clamp01(parent.v + (dv / (dist || 1)) * leash * 0.6);
      return;
    }
    cu = parent.u;
    cv = parent.v;
  }
  const ang = Math.random() * Math.PI * 2;
  const hop = rand(b.hop * 0.4, b.hop);
  let tu = ent.u + Math.cos(ang) * hop;
  let tv = ent.v + Math.sin(ang) * hop;
  if (parent) {
    // Keep the target inside the leash circle around the parent.
    const du = tu - cu;
    const dv = tv - cv;
    const d = Math.hypot(du, dv);
    const leash = leashOf(ent);
    if (d > leash) {
      tu = cu + (du / d) * leash;
      tv = cv + (dv / d) * leash;
    }
  }
  ent.tu = clamp01(tu);
  ent.tv = clamp01(tv);
}

function stepBehavior(ent, dt) {
  if (ent.mode === "held") return;
  const b = behaviorOf(ent);

  if (ent.mode === "act") {
    ent.modeLeft -= dt;
    if (ent.modeLeft <= 0) {
      if (!b.roam) {
        // Needs the user: keep acting in place until the state changes.
        ent.modeLeft = b.act;
        return;
      }
      ent.mode = "stroll";
      pickTarget(ent);
      applyAnim(ent);
    }
    return;
  }

  // stroll: walk toward the target.
  const speed = ent.role === "root" ? ROOT_SPEED : b.speed;
  const du = ent.tu - ent.u;
  const dv = ent.tv - ent.v;
  const dist = Math.hypot(du, dv);
  const step = speed * dt;
  if (dist <= step || dist < 0.004) {
    ent.u = ent.tu;
    ent.v = ent.tv;
    ent.mode = "act";
    ent.modeLeft = b.act + Math.random() * b.actVar;
    // Acting plays the state motion facing the way the dog was last heading.
    applyAnim(ent);
  } else {
    ent.u += (du / dist) * step;
    ent.v += (dv / dist) * step;
  }
}

/** Soft separation: push overlapping pairs apart so characters never stack. */
function separate(dims) {
  const list = [...entities.values()].filter((e) => !e.held);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const du = b.u - a.u;
      const dv = b.v - a.v;
      // Minimum comfortable distance, scaled from sprite sizes to floor units.
      const need =
        ((sizeOf(a, dims) + sizeOf(b, dims)) * 0.55 + GAP) / Math.max(1, dims.w);
      const d = Math.hypot(du, dv) || 0.0001;
      if (d < need) {
        const push = (need - d) * 0.5;
        const px = (du / d) * push;
        const py = (dv / d) * push;
        a.u = clamp01(a.u - px);
        a.v = clamp01(a.v - py * 0.6); // depth shifts read stronger — damp them
        b.u = clamp01(b.u + px);
        b.v = clamp01(b.v + py * 0.6);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function stageDims() {
  const w = stageEl.clientWidth || 380;
  const h = stageEl.clientHeight || 420;
  return { w, h, yTop: PAD_TOP, yBottom: h - PAD_BOTTOM };
}

/** Density scale: with many sessions everyone shrinks a bit (AM-9 spirit). */
function densityScale() {
  const n = [...entities.values()].filter((e) => e.role === "session").length;
  return n <= 5 ? 1 : Math.max(0.55, Math.sqrt(5 / n));
}

function sizeOf(ent, dims) {
  const tier = SIZE_TIERS[ent.role === "overflow" ? "session" : ent.role] || SIZE_TIERS.session;
  const depth = SCALE_FAR + (SCALE_NEAR - SCALE_FAR) * ent.v;
  const density = ent.role === "root" ? 1 : dims.density;
  return Math.max(MIN_CHILD * 0.75, Math.round(tier * depth * density));
}

function project(ent, dims) {
  const x = PAD_X + ent.u * (dims.w - PAD_X * 2);
  const y = dims.yTop + ent.v * (dims.yBottom - dims.yTop);
  return { x, y };
}

function applyTransforms(dims) {
  for (const ent of entities.values()) {
    const { x, y } = project(ent, dims);
    const size = sizeOf(ent, dims);
    const wrap = ent.wrapEl;
    if (wrap && wrap._size !== size) {
      wrap.style.width = `${size}px`;
      wrap.style.height = `${size}px`;
      wrap._size = size;
    }
    // Nodes anchor at bottom-center (feet on the floor point); keep the whole
    // node — sprite above, title below, bubble on top — inside the stage.
    const cx = Math.max(size / 2 + 2, Math.min(dims.w - size / 2 - 2, x));
    const cy = Math.max(size + 46, Math.min(dims.yBottom + 18, y));
    ent.el.style.left = `${cx}px`;
    ent.el.style.top = `${cy}px`;
    ent.el.style.zIndex = String(1 + Math.round(ent.v * 100));
  }
}

function drawLeashes(dims) {
  const links = [];
  for (const ent of entities.values()) {
    if (!ent.parentId) continue;
    const parent = entities.get(ent.parentId);
    if (!parent) continue;
    const from = project(parent, dims);
    const to = project(ent, dims);
    const fromSize = sizeOf(parent, dims);
    const toSize = sizeOf(ent, dims);
    // Attach low on the body (lower-rear, ~22% of the sprite above the title
    // strip), not at the sprite's vertical center: a center anchor sits at head
    // height on small sprites, so a leash to a character further back appeared
    // to pierce through the head (GF-125). The harness layer draws behind the
    // nodes, so a low anchor reads as clipped to the character's back.
    links.push({
      from: { x: from.x, y: from.y - 14 - fromSize * LEASH_ANCHOR },
      to: { x: to.x, y: to.y - 14 - toSize * LEASH_ANCHOR },
      session: ent.session,
    });
  }
  drawHarness(harnessSvg, links, dims.w, dims.h);
}

// ---------------------------------------------------------------------------
// Drag interaction (drag = move the dog; click = open detail)
// ---------------------------------------------------------------------------

function screenToFloor(x, y, dims) {
  const rect = stageEl.getBoundingClientRect();
  const u = (x - rect.left - PAD_X) / (dims.w - PAD_X * 2);
  const v = (y - rect.top - dims.yTop) / (dims.yBottom - dims.yTop);
  return { u: clamp01(u), v: clamp01(v) };
}

function wirePointer(ent) {
  const el = ent.el;
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    ent.dragMoved = false;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      if (
        !ent.dragMoved &&
        Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      if (!ent.dragMoved) {
        ent.dragMoved = true;
        ent.held = true;
        ent.mode = "held";
        el.classList.add("held");
        ent.sprite.setAnim(activeSheet().stateAnims[ent.state] || "idle", STATE_COLOR[ent.state]);
      }
      const dims = stageDims();
      dims.density = densityScale();
      const pos = screenToFloor(ev.clientX, ev.clientY, dims);
      ent.u = pos.u;
      ent.v = pos.v;
      if (reducedMotion.matches) {
        // No rAF loop under reduced motion — project this move directly.
        applyTransforms(dims);
        drawLeashes(dims);
      }
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      if (ent.dragMoved) {
        ent.held = false;
        el.classList.remove("held");
        // Settle where dropped: act briefly, then resume strolling from here.
        ent.tu = ent.u;
        ent.tv = ent.v;
        ent.mode = "act";
        ent.modeLeft = rand(1, 2.5);
        applyAnim(ent);
      } else if (ent.session && onSelectFn) {
        onSelectFn(ent.session.id);
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

function tick(now) {
  rafId = null;
  if (!stageEl || !stageEl.isConnected || stageEl.hidden) return; // mode left
  if (document.hidden) return; // resumed by visibilitychange below
  const dt = Math.min(0.1, (now - lastTick) / 1000 || 0.016);
  lastTick = now;

  const dims = stageDims();
  dims.density = densityScale();

  if (!reducedMotion.matches) {
    for (const ent of entities.values()) stepBehavior(ent, dt);
    separate(dims);
  }
  applyTransforms(dims);
  drawLeashes(dims);

  rafId = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (rafId === null && stageEl) {
    lastTick = 0;
    rafId = requestAnimationFrame(tick);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ensureLoop();
  });
}

// ---------------------------------------------------------------------------
// Reconcile + entry point
// ---------------------------------------------------------------------------

/** Static spread for reduced motion: deterministic ring placement, no roaming. */
function placeStatic() {
  const sessions = [...entities.values()].filter((e) => e.role === "session");
  const subs = [...entities.values()].filter((e) => e.role === "subagent");
  const root = entities.get(ROOT_ID);
  if (root) {
    root.u = 0.5;
    root.v = 0.25;
  }
  sessions.forEach((ent, i) => {
    ent.u = (i + 1) / (sessions.length + 1);
    ent.v = 0.62;
  });
  subs.forEach((ent) => {
    const parent = entities.get(ent.parentId);
    const siblings = subs.filter((s) => s.parentId === ent.parentId);
    const idx = siblings.indexOf(ent);
    ent.u = clamp01((parent ? parent.u : 0.5) + (idx - (siblings.length - 1) / 2) * 0.08);
    ent.v = 0.86;
  });
}

/**
 * Render the animated mode into `stage` from the current snapshot.
 * @param {HTMLElement} stage the #stage element (already visible)
 * @param {Array<object>} sessions current snapshot
 * @param {(id:string)=>void} onSelect opens the detail view (AM-6)
 */
export function renderAnimMode(stage, sessions, onSelect) {
  if (!stage) return;
  stageEl = stage;
  onSelectFn = onSelect;
  const list = Array.isArray(sessions) ? sessions : [];
  harnessSvg = ensureHarnessLayer(stage);

  if (!resizeObserver && typeof ResizeObserver !== "undefined") {
    // Positions are relative (u,v) so a resize only needs a reprojection — the
    // next tick handles it; the observer matters for the reduced-motion path.
    resizeObserver = new ResizeObserver(() => {
      if (reducedMotion.matches && stageEl) {
        const dims = stageDims();
        dims.density = densityScale();
        applyTransforms(dims);
        drawLeashes(dims);
      }
    });
    resizeObserver.observe(stage);
  }

  // Root is always present (AM-2).
  let root = entities.get(ROOT_ID);
  if (!root) {
    root = makeEntity(ROOT_ID, "root", null, null);
    root.u = 0.5;
    root.v = 0.35;
    root.tu = 0.5;
    root.tv = 0.35;
  }

  const forest = buildForest(list);

  // Capacity guard (AM-9): beyond what the stage can hold at the floor size,
  // fold the extra sessions into one roaming "+N" cluster.
  const dims = stageDims();
  const capacity = Math.max(2, Math.floor((dims.w - PAD_X * 2) / (MIN_CHILD + GAP)) * 2);
  const top = forest.children;
  const visibleTop = top.length > capacity ? top.slice(0, capacity - 1) : top;
  const overflowCount = top.length - visibleTop.length;

  const desired = new Map(); // id → {role, session, parentId}
  for (const node of visibleTop) {
    desired.set(node.id, { role: "session", session: node.session, parentId: ROOT_ID });
    for (const sub of node.children) {
      desired.set(sub.id, { role: "subagent", session: sub.session, parentId: node.id });
    }
  }

  // Despawn entities whose session is gone (root/overflow handled separately).
  for (const ent of [...entities.values()]) {
    if (ent.id === ROOT_ID || ent.id === OVERFLOW_ID) continue;
    if (!desired.has(ent.id)) destroyEntity(ent);
  }
  // Spawn/patch the rest.
  for (const [id, info] of desired) {
    let ent = entities.get(id);
    if (!ent) {
      ent = makeEntity(id, info.role, info.session, entities.get(info.parentId));
      ent.parentId = info.parentId;
    }
    ent.parentId = info.parentId;
    updateEntity(ent, info.session);
  }

  // Overflow cluster (+N) — itself a little roaming dog.
  let overflow = entities.get(OVERFLOW_ID);
  if (overflowCount > 0) {
    if (!overflow) {
      overflow = makeEntity(OVERFLOW_ID, "overflow", null, root);
      overflow.parentId = ROOT_ID;
      overflow.el.classList.add("anim-overflow");
    }
    setEntityState(overflow, "idle");
    const count = overflow.el.querySelector(".overflow-count");
    if (count) count.textContent = `+${overflowCount}`;
  } else if (overflow) {
    destroyEntity(overflow);
  }

  updateEntity(root, null);
  setEntityState(root, rootState(list));

  if (reducedMotion.matches) {
    placeStatic();
    const d = stageDims();
    d.density = densityScale();
    applyTransforms(d);
    drawLeashes(d);
  } else {
    ensureLoop();
  }
}
