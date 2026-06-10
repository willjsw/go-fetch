// GoFetch character spec — data (Task 32 / GF-111).
//
// The visual definition of the pixel "AI" character, lifted out of character.js
// so expressions, colors, parts, and size tiers can be edited in one place
// without touching render logic (AM-7 maintainability). character.js consumes
// these to assemble the inline SVG; the animated mode (GF-112+) reuses the same
// colors (e.g. harness line tint) and size tiers.

/** Per-state accent color (antenna light + UI accents). */
export const STATE_COLOR = {
  working: "#4ade80",
  waiting: "#fbbf24",
  error: "#f87171",
  done: "#60a5fa",
  idle: "#9ca3af",
  // SL-5 "detected but unconfirmed" — violet, distinct from the five states.
  pending: "#a78bfa",
};

export const BODY = "#f4f4f6"; // white character
export const INK = "#1c1c22"; // facial features
export const CLOUD = "#dfe3ee"; // soft cloud under the root Fetchy

/**
 * Character size in px per role/depth tier (AM-10 / GF-112 layout). The SVG
 * itself is viewBox-scaled; these drive the container size so the parent Fetchy
 * reads bigger and sub-agents (depth 2) read smaller.
 */
export const SIZE_TIERS = {
  // Claude Code itself (always shown). Bumped from 64 so the bigger cloud
  // (ROOT_VIEWBOX, ~36 units tall vs 24) renders at the same per-unit scale —
  // i.e. the Fetchy keeps its size while the cloud grows ~2–3×.
  root: 96,
  session: 44, // one Claude Code session
  subagent: 30, // a sub-agent within a session (Layer 2, GF-112+)
};

/**
 * Expanded viewBox used only for the root Fetchy so the larger cloud has room
 * below/around the body without clipping. Same per-unit scale as the 24×24
 * grid (36 units in a 96px box ≈ 24 units in a 64px box), so the character
 * itself is unchanged — only the drawable area (for the cloud) grew.
 */
export const ROOT_VIEWBOX = "-6 -2 36 36";

// State-specific features (eyes / mouth / accessory). Coordinates are on the
// 24×24 grid; the head occupies roughly x:3..21, y:4..20.
export const EXPRESSIONS = {
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
export const ARMS = `
    <rect class="gf-arm gf-arm-l" x="1" y="11" width="2" height="4" fill="${BODY}"/>
    <rect class="gf-arm gf-arm-r" x="21" y="11" width="2" height="4" fill="${BODY}"/>`;

// A puffy pixel cloud the root Fetchy rides on (AM-10). Drawn in the expanded
// ROOT_VIEWBOX bottom region (x −4..28, y 21..32) so it's ~2–3× the old cloud
// (was ~16×4 units → now ~32×11). Bottom-widest, with puffs just under the
// body. The whole SVG gets the `gf-float` motion, so the cloud drifts too.
export const ROOT_CLOUD = `
    <rect class="gf-cloud" x="-4" y="28" width="32" height="4" fill="${CLOUD}"/>
    <rect class="gf-cloud" x="-1" y="25" width="26" height="3" fill="${CLOUD}"/>
    <rect class="gf-cloud" x="2" y="23" width="9" height="2" fill="${CLOUD}"/>
    <rect class="gf-cloud" x="14" y="22" width="9" height="3" fill="${CLOUD}"/>
    <rect class="gf-cloud" x="8" y="21" width="6" height="2" fill="${CLOUD}"/>`;
