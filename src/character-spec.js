// GoFetch character spec — shared visual constants.
//
// The pixel artwork itself lives in sprite sheets (src/sprites/*.js, GF-117);
// this module keeps the cross-cutting constants every renderer shares: the
// per-state accent palette and the per-role size tiers.

/** Per-state accent color (leashes, card accents, @state sprite pixels). */
export const STATE_COLOR = {
  working: "#4ade80",
  waiting: "#fbbf24",
  error: "#f87171",
  done: "#60a5fa",
  idle: "#9ca3af",
  // SL-5 "detected but unconfirmed" — violet, distinct from the five states.
  pending: "#a78bfa",
};

/** Character size in px per role/depth tier (AM-10 / GF-112 layout). */
export const SIZE_TIERS = {
  root: 96,
  session: 44,
  subagent: 30,
};
