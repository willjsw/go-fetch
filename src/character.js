// GoFetch pixel-art character (Fetchy the retriever puppy, GF-108).
//
// A golden retriever pup rendered as an inline SVG (24×24 pixel grid, crisp
// edges). Parts are distinguished by color (golden fur, darker floppy ears,
// cream muzzle/chest, dark nose/eyes) so it reads as a dog on the dark widget.
// Each state gets a distinct face; the state color rides on the scattered dots.
//
// Visual data lives in character-spec.js so it can be tuned without touching
// this render logic (AM-7).

import {
  STATE_COLOR,
  DOG_BASE,
  PAWS,
  COLLAR,
  EXPRESSIONS,
  scatterDots,
  ROOT_CLOUD,
  ROOT_VIEWBOX,
} from "./character-spec.js";

// Re-export so existing consumers can keep importing STATE_COLOR from here.
export { STATE_COLOR };

/**
 * Inline SVG for the pup in a given state. Falls back to `idle`.
 * @param {string} state one of working|waiting|error|done|idle|pending
 * @param {object} [opts]
 * @param {('root'|'session'|'subagent')} [opts.role] role tier — `root` adds a
 *   red collar and a cloud (the cloud is a separate group so only the pup bobs,
 *   GF-108 #4). Omitting `opts` preserves the original single-argument behavior.
 * @returns {string} SVG markup
 */
export function characterSvg(state, opts = {}) {
  const { role } = opts;
  const key = EXPRESSIONS[state] ? state : "idle";
  const color = STATE_COLOR[key];
  const collar = role === "root" ? COLLAR : ""; // red collar on Claude Code pup
  // Pup parts, back→front: silhouette, paws, collar, face, scattered dots.
  const body = `${DOG_BASE}${PAWS}${collar}${EXPRESSIONS[key]}${scatterDots(color)}`;
  const roleClass = role ? ` gf-char-${role}` : "";
  // Root uses an expanded viewBox so the cloud has room (same per-unit scale).
  const viewBox = role === "root" ? ROOT_VIEWBOX : "0 0 24 24";
  // The cloud is a sibling group of the pup so motion targets only `.gf-body`
  // and the cloud stays still (GF-108 #4).
  const cloud = role === "root" ? `<g class="gf-cloud-layer">${ROOT_CLOUD}</g>` : "";
  return `<svg class="gf-char gf-char-${key}${roleClass}" viewBox="${viewBox}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${key}">
    ${cloud}
    <g class="gf-body">${body}</g>
  </svg>`;
}
