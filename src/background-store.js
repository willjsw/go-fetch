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

/** Apply the active background as a `bg-*` class on the #stage element. */
export function applyBackground() {
  const stage = document.getElementById("stage");
  if (!stage) return;
  for (const cls of [...stage.classList]) {
    if (cls.startsWith("bg-")) stage.classList.remove(cls);
  }
  if (current !== "none") stage.classList.add(`bg-${current}`);
}
