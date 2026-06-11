// Active stage-background store (GF-128).
//
// Same pattern as character-store.js: one global choice, persisted in
// localStorage, with change listeners. The backgrounds themselves are pure CSS
// (styles.css `.stage.bg-*`) — this store only tracks WHICH one is active and
// applies the class to the #stage element.

const KEY = "gofetch:background";

/** Selectable backgrounds, in menu order. `none` keeps the plain dark stage. */
export const BACKGROUND_LABELS = [
  ["none", "Default (dark)"],
  ["field", "Field"],
  ["deepsea", "Deep Sea"],
  ["space", "Space"],
  ["city", "City"],
  ["desert", "Desert"],
  ["iceland", "Iceland"],
];

const VALID = new Set(BACKGROUND_LABELS.map(([id]) => id));

/** Ambient critter markup per background (GF-135): one or two tiny moving
 *  decorations (≤ ~12px, dimmed, pointer-inert) rendered into a dedicated
 *  `.stage-ambient` layer behind the characters. Shapes, sizes, and all
 *  motion live in styles.css; `none` keeps the layer empty. */
const AMBIENT_HTML = {
  field: '<span class="amb-bird"></span>',
  deepsea:
    '<span class="amb-fish f1"></span><span class="amb-fish f2"></span><span class="amb-fish f3"></span>',
  space: '<span class="amb-rocket"></span>',
  city: '<span class="amb-car"></span><span class="amb-car rev"></span>',
  desert: '<span class="amb-scorpion"></span>',
  iceland: '<span class="amb-snow s1"></span><span class="amb-snow s2"></span>',
};

let current = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    return VALID.has(saved) ? saved : "none";
  } catch (_err) {
    return "none";
  }
})();

const listeners = new Set();

/** The selected background's id (e.g. "space"). */
export function activeBackground() {
  return current;
}

/** Switch backgrounds, persist, apply to the stage, and notify listeners. */
export function setBackground(id) {
  if (!VALID.has(id) || id === current) return;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch (_err) {
    /* persistence is best-effort */
  }
  applyBackground();
  for (const fn of listeners) fn(id);
}

/** Subscribe to background changes. */
export function onBackgroundChange(fn) {
  listeners.add(fn);
}

/** Apply the active background as a `bg-*` class on the #stage element, and
 *  (re)populate its ambient critter layer (GF-135). */
export function applyBackground() {
  const stage = document.getElementById("stage");
  if (!stage) return;
  for (const cls of [...stage.classList]) {
    if (cls.startsWith("bg-")) stage.classList.remove(cls);
  }
  if (current !== "none") stage.classList.add(`bg-${current}`);

  // One persistent decorative layer, swapped per background. anim-mode only
  // ever adds/removes its own nodes, so this child survives re-renders. It is
  // aria-hidden (pure decoration) and pointer-inert via CSS.
  let ambient = stage.querySelector(".stage-ambient");
  if (!ambient) {
    ambient = document.createElement("div");
    ambient.className = "stage-ambient";
    ambient.setAttribute("aria-hidden", "true");
    stage.appendChild(ambient);
  }
  ambient.innerHTML = AMBIENT_HTML[current] || "";
}
