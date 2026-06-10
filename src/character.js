// Static character renderer (GF-117) — thin adapter over the sprite engine.
//
// Cards mode, the detail popover, and the empty state want the character's
// *look* for a state without a live animator; this keeps their original
// `characterSvg(state)` contract but renders the white dog's first frame for
// that state from the sprite sheet (sprites/dog.js). Live animation lives in
// anim-mode.js via SpriteAnimator.

import { STATE_COLOR } from "./character-spec.js";
import { spriteFrameSvg } from "./sprite-engine.js";
import dogSheet from "./sprites/dog.js";

// Re-export so existing consumers can keep importing STATE_COLOR from here.
export { STATE_COLOR };

/**
 * Static SVG for the dog in a given state (first frame of its state motion).
 * @param {string} state one of working|waiting|error|done|idle|pending
 * @param {object} [opts]
 * @param {('root'|'session'|'subagent')} [opts.role] `root` adds the red collar
 * @returns {string} SVG markup
 */
export function characterSvg(state, opts = {}) {
  const key = STATE_COLOR[state] ? state : "idle";
  const anim = dogSheet.stateAnims[key] || "idle";
  return spriteFrameSvg(
    dogSheet,
    anim,
    STATE_COLOR[key],
    opts.role === "root" ? "collar" : null,
  );
}
