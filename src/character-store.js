// Active-character store (GF-118).
//
// One global choice: every renderer (roaming stage, cards, detail popover,
// empty state) draws the same character. Persisted in localStorage; renderers
// read the live sheet via `activeSheet()` whenever they construct an animator,
// and main.js resets them all when the choice changes.

import { CHARACTERS } from "./sprites/index.js";

const KEY = "gofetch:character";

let current = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    return CHARACTERS[saved] ? saved : "dog";
  } catch (_err) {
    return "dog";
  }
})();

const listeners = new Set();

/** The selected character's id (e.g. "dog"). */
export function activeCharacter() {
  return current;
}

/** The selected character's sprite sheet. */
export function activeSheet() {
  return CHARACTERS[current];
}

/** Switch characters, persist, and notify renderers to rebuild. */
export function setCharacter(name) {
  if (!CHARACTERS[name] || name === current) return;
  current = name;
  try {
    localStorage.setItem(KEY, name);
  } catch (_err) {
    /* persistence is best-effort */
  }
  for (const fn of listeners) fn(name);
}

/** Subscribe to character changes (renderer teardown hooks). */
export function onCharacterChange(fn) {
  listeners.add(fn);
}
