// GoFetch pixel-art character (Task 11 / GF-16).
//
// A white, blocky "AI" character rendered as an inline SVG (24×24 pixel grid,
// crisp edges) — lightweight, scalable, and version-controlled, with no binary
// sprite assets. Each of the five states gets a distinct expression/pose
// (WC-2/WC-3). The antenna light is tinted with the state color.

export const STATE_COLOR = {
  working: "#4ade80",
  waiting: "#fbbf24",
  error: "#f87171",
  done: "#60a5fa",
  idle: "#9ca3af",
  // SL-5 "detected but unconfirmed" — violet, distinct from the five states.
  pending: "#a78bfa",
};

const BODY = "#f4f4f6"; // white character
const INK = "#1c1c22"; // facial features

// State-specific features (eyes / mouth / accessory). Coordinates are on the
// 24×24 grid; the head occupies roughly x:3..21, y:4..20.
const FEATURES = {
  // Focused eyes, flat mouth, a blue "concentration" sweat drop.
  working: `
    <rect x="7" y="9" width="2" height="5" fill="${INK}"/>
    <rect x="15" y="9" width="2" height="5" fill="${INK}"/>
    <rect x="10" y="16" width="4" height="1" fill="${INK}"/>
    <rect x="19" y="8" width="2" height="2" fill="#60a5fa"/>
    <rect x="19" y="10" width="2" height="3" fill="#60a5fa"/>`,
  // Eyes glancing up, small open mouth, an amber "?" spark — expectant.
  waiting: `
    <rect x="7" y="8" width="3" height="3" fill="${INK}"/>
    <rect x="14" y="8" width="3" height="3" fill="${INK}"/>
    <rect x="11" y="15" width="3" height="3" fill="${INK}"/>
    <rect x="17" y="4" width="2" height="2" fill="#fbbf24"/>
    <rect x="18" y="6" width="1" height="2" fill="#fbbf24"/>
    <rect x="18" y="9" width="1" height="1" fill="#fbbf24"/>`,
  // Down-slanted brows + worried open frown — distressed.
  error: `
    <rect x="6" y="7" width="5" height="1" fill="${INK}" transform="rotate(22 8 8)"/>
    <rect x="13" y="7" width="5" height="1" fill="${INK}" transform="rotate(-22 16 8)"/>
    <rect x="7" y="10" width="2" height="2" fill="${INK}"/>
    <rect x="15" y="10" width="2" height="2" fill="${INK}"/>
    <rect x="9" y="17" width="6" height="1" fill="${INK}"/>
    <rect x="8" y="16" width="1" height="1" fill="${INK}"/>
    <rect x="15" y="16" width="1" height="1" fill="${INK}"/>`,
  // Happy "^ ^" eyes + smile + a sparkle — proud/done.
  done: `
    <rect x="6" y="11" width="1" height="1" fill="${INK}"/>
    <rect x="7" y="10" width="2" height="1" fill="${INK}"/>
    <rect x="9" y="11" width="1" height="1" fill="${INK}"/>
    <rect x="14" y="11" width="1" height="1" fill="${INK}"/>
    <rect x="15" y="10" width="2" height="1" fill="${INK}"/>
    <rect x="17" y="11" width="1" height="1" fill="${INK}"/>
    <rect x="9" y="15" width="1" height="1" fill="${INK}"/>
    <rect x="10" y="16" width="4" height="1" fill="${INK}"/>
    <rect x="14" y="15" width="1" height="1" fill="${INK}"/>
    <rect x="18" y="6" width="2" height="2" fill="#60a5fa"/>`,
  // Closed flat eyes + a grey "z" — sleepy/idle.
  idle: `
    <rect x="7" y="11" width="3" height="1" fill="${INK}"/>
    <rect x="14" y="11" width="3" height="1" fill="${INK}"/>
    <rect x="11" y="16" width="2" height="1" fill="${INK}"/>
    <rect x="16" y="4" width="3" height="1" fill="#9ca3af"/>
    <rect x="18" y="5" width="1" height="1" fill="#9ca3af"/>
    <rect x="17" y="6" width="1" height="1" fill="#9ca3af"/>
    <rect x="16" y="7" width="3" height="1" fill="#9ca3af"/>`,
  // Neutral dot eyes + a violet "?" — detected, state unconfirmed (SL-5).
  pending: `
    <rect x="7" y="10" width="2" height="2" fill="${INK}"/>
    <rect x="15" y="10" width="2" height="2" fill="${INK}"/>
    <rect x="10" y="14" width="3" height="1" fill="#a78bfa"/>
    <rect x="13" y="15" width="1" height="1" fill="#a78bfa"/>
    <rect x="11" y="16" width="2" height="1" fill="#a78bfa"/>
    <rect x="11" y="18" width="1" height="1" fill="#a78bfa"/>`,
};

// Two stubby pixel arms, one per side of the head. Rendered only in the
// `working` state (WC-10/WC-11); the flapping motion is added in CSS (WC-11).
const ARMS = `
    <rect class="gf-arm gf-arm-l" x="1" y="11" width="2" height="4" fill="${BODY}"/>
    <rect class="gf-arm gf-arm-r" x="21" y="11" width="2" height="4" fill="${BODY}"/>`;

/**
 * Inline SVG for the character in a given state. Falls back to `idle`.
 * @param {string} state one of working|waiting|error|done|idle
 * @returns {string} SVG markup
 */
export function characterSvg(state) {
  const key = FEATURES[state] ? state : "idle";
  const color = STATE_COLOR[key];
  // Head as a pixel-stepped square (1px corner cuts) instead of a smooth
  // rounded rect — reads as dot/pixel art (WC-10). Same x3..21 / y4..20 bounds.
  const head =
    "M4,4 H20 V5 H21 V19 H20 V20 H4 V19 H3 V5 H4 Z";
  const arms = key === "working" ? ARMS : ""; // arms only while working (WC-11)
  return `<svg class="gf-char gf-char-${key}" viewBox="0 0 24 24" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${key}">
    <rect x="11" y="1" width="2" height="3" fill="${BODY}"/>
    <rect x="10" y="0" width="4" height="2" fill="${color}"/>
    <path d="${head}" fill="${BODY}"/>
    ${arms}
    ${FEATURES[key]}
  </svg>`;
}
