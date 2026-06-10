// GoFetch pixel-art character (Task 11 / GF-16; data split in GF-111).
//
// A white, blocky "AI" character rendered as an inline SVG (24×24 pixel grid,
// crisp edges) — lightweight, scalable, and version-controlled, with no binary
// sprite assets. Each of the five states gets a distinct expression/pose
// (WC-2/WC-3). The antenna light is tinted with the state color.
//
// Visual data (colors, expressions, parts, size tiers) lives in
// character-spec.js so it can be edited without touching this render logic.

import { STATE_COLOR, BODY, EXPRESSIONS, ARMS, ROOT_CLOUD } from "./character-spec.js";

// Re-export so existing consumers can keep importing STATE_COLOR from here.
export { STATE_COLOR };

/**
 * Inline SVG for the character in a given state. Falls back to `idle`.
 * @param {string} state one of working|waiting|error|done|idle|pending
 * @param {object} [opts]
 * @param {('root'|'session'|'subagent')} [opts.role] role tier — `root` adds a
 *   cloud and a floating motion (AM-10); others render the plain character.
 *   Omitting `opts` preserves the original single-argument behavior.
 * @returns {string} SVG markup
 */
export function characterSvg(state, opts = {}) {
  const { role } = opts;
  const key = EXPRESSIONS[state] ? state : "idle";
  const color = STATE_COLOR[key];
  // Head as a pixel-stepped square (1px corner cuts) instead of a smooth
  // rounded rect — reads as dot/pixel art (WC-10). Same x3..21 / y4..20 bounds.
  const head = "M4,4 H20 V5 H21 V19 H20 V20 H4 V19 H3 V5 H4 Z";
  const arms = key === "working" ? ARMS : ""; // arms only while working (WC-11)
  const cloud = role === "root" ? ROOT_CLOUD : ""; // floating cloud (AM-10)
  const roleClass = role ? ` gf-char-${role}` : "";
  return `<svg class="gf-char gf-char-${key}${roleClass}" viewBox="0 0 24 24" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${key}">
    <rect x="11" y="1" width="2" height="3" fill="${BODY}"/>
    <rect x="10" y="0" width="4" height="2" fill="${color}"/>
    <path d="${head}" fill="${BODY}"/>
    ${arms}
    ${EXPRESSIONS[key]}
    ${cloud}
  </svg>`;
}
