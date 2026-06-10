// GoFetch character spec — data (Fetchy the retriever puppy, GF-108).
//
// Drawn on the dark widget, so parts are distinguished by COLOR (golden fur,
// darker floppy ears, cream muzzle/chest, dark nose/eyes) rather than relying on
// a flat white silhouette. Per-state face lives in EXPRESSIONS; the state color
// rides on the scattered dots. The root pup also wears a red collar and sits on
// a cloud. All visual data lives here so it can be tuned without touching render
// logic (AM-7).

/** Per-state accent color (scattered dots + UI accents). */
export const STATE_COLOR = {
  working: "#4ade80",
  waiting: "#fbbf24",
  error: "#f87171",
  done: "#60a5fa",
  idle: "#9ca3af",
  // SL-5 "detected but unconfirmed" — violet, distinct from the five states.
  pending: "#a78bfa",
};

const FUR = "#e0a85c"; // golden retriever coat
const EAR = "#bd7e36"; // darker ears (so they read as separate floppy ears)
const CREAM = "#f6ecd6"; // muzzle / chest / paws
const NOSE = "#241a12"; // nose / eyes / mouth
const COLLAR_COLOR = "#e23b3b"; // red collar (root only)
const TAG = "#f4c542"; // collar tag
const TONGUE = "#f472b6"; // little pink tongue
const CLOUD_FILL = "#dfe3ee"; // soft cloud under the root pup

/** Character size in px per role/depth tier (AM-10 / GF-112 layout). */
export const SIZE_TIERS = {
  root: 96,
  session: 44,
  subagent: 30,
};

/** Expanded viewBox for the root so the cloud has room (GF-108). */
export const ROOT_VIEWBOX = "-6 -2 36 36";

// The pup, back→front: ears, body, chest blaze, head, muzzle, nose. Ears are a
// darker gold and flare past the head so the dog shape reads. (Front paws and
// the collar are separate so they can animate / be root-only.)
export const DOG_BASE = `
    <rect class="gf-ear gf-ear-l" x="2" y="6" width="4" height="9" fill="${EAR}"/>
    <rect class="gf-ear gf-ear-r" x="18" y="6" width="4" height="9" fill="${EAR}"/>
    <rect x="6" y="15" width="12" height="7" fill="${FUR}"/>
    <rect x="9" y="17" width="6" height="5" fill="${CREAM}"/>
    <rect x="6" y="5" width="12" height="10" fill="${FUR}"/>
    <rect x="7" y="4" width="10" height="1" fill="${FUR}"/>
    <rect x="9" y="12" width="6" height="6" fill="${CREAM}"/>
    <rect x="11" y="13" width="2" height="2" fill="${NOSE}"/>`;

// Front paws (cream), separate so they can "dig" while working (GF-108).
export const PAWS = `
    <rect class="gf-paw gf-paw-l" x="6" y="20" width="3" height="2" fill="${CREAM}"/>
    <rect class="gf-paw gf-paw-r" x="15" y="20" width="3" height="2" fill="${CREAM}"/>`;

// Red collar + tag — root (Claude Code) pup only (GF-108).
export const COLLAR = `
    <rect x="6" y="15" width="12" height="2" fill="${COLLAR_COLOR}"/>
    <rect x="11" y="17" width="2" height="2" fill="${TAG}"/>`;

// Per-state face (eyes + mouth/extra). Eyes at ~x8 / x14, y8-10; nose x11-13,
// y13-15; mouth/tongue just below.
export const EXPRESSIONS = {
  // Focused eyes + panting tongue — hard at work (paws dig, see CSS).
  working: `
    <rect x="8" y="8" width="2" height="2" fill="${NOSE}"/>
    <rect x="14" y="8" width="2" height="2" fill="${NOSE}"/>
    <rect x="11" y="15" width="2" height="2" fill="${TONGUE}"/>`,
  // Eyes glancing up + tiny mouth — expectant, waiting for you.
  waiting: `
    <rect x="8" y="8" width="2" height="2" fill="${NOSE}"/>
    <rect x="14" y="8" width="2" height="2" fill="${NOSE}"/>
    <rect x="11" y="16" width="2" height="1" fill="${NOSE}"/>`,
  // Down-slanted brows + worried eyes + frown — distressed.
  error: `
    <rect x="7" y="7" width="3" height="1" fill="${NOSE}" transform="rotate(20 8 7)"/>
    <rect x="14" y="7" width="3" height="1" fill="${NOSE}" transform="rotate(-20 16 7)"/>
    <rect x="8" y="9" width="2" height="2" fill="${NOSE}"/>
    <rect x="14" y="9" width="2" height="2" fill="${NOSE}"/>
    <rect x="10" y="16" width="4" height="1" fill="${NOSE}"/>`,
  // Happy ^ ^ eyes + big smile with tongue — proud/done.
  done: `
    <rect x="8" y="9" width="1" height="1" fill="${NOSE}"/>
    <rect x="9" y="8" width="1" height="1" fill="${NOSE}"/>
    <rect x="10" y="9" width="1" height="1" fill="${NOSE}"/>
    <rect x="13" y="9" width="1" height="1" fill="${NOSE}"/>
    <rect x="14" y="8" width="1" height="1" fill="${NOSE}"/>
    <rect x="15" y="9" width="1" height="1" fill="${NOSE}"/>
    <rect x="10" y="15" width="4" height="1" fill="${NOSE}"/>
    <rect x="11" y="16" width="2" height="2" fill="${TONGUE}"/>`,
  // Closed sleepy eyes + a little "z" — napping/idle.
  idle: `
    <rect x="8" y="9" width="2" height="1" fill="${NOSE}"/>
    <rect x="14" y="9" width="2" height="1" fill="${NOSE}"/>
    <rect x="11" y="16" width="2" height="1" fill="${NOSE}"/>
    <rect x="19" y="5" width="2" height="1" fill="#9ca3af"/>
    <rect x="20" y="6" width="1" height="1" fill="#9ca3af"/>
    <rect x="19" y="7" width="2" height="1" fill="#9ca3af"/>`,
  // Neutral dot eyes — detected, state unconfirmed (SL-5; pup spins, see CSS).
  pending: `
    <rect x="8" y="8" width="2" height="2" fill="${NOSE}"/>
    <rect x="14" y="8" width="2" height="2" fill="${NOSE}"/>
    <rect x="11" y="16" width="2" height="1" fill="${NOSE}"/>`,
};

/**
 * The "scattered dots" around the pup (도트 흩날림), tinted with the state color
 * so they double as the state indicator. Each gets a `gf-dot gf-dot-N` class so
 * CSS can make them drift. Returns SVG markup.
 */
export function scatterDots(color) {
  return `
    <rect class="gf-dot gf-dot-1" x="21" y="3" width="2" height="2" fill="${color}"/>
    <rect class="gf-dot gf-dot-2" x="1" y="5" width="2" height="2" fill="${color}"/>
    <rect class="gf-dot gf-dot-3" x="23" y="10" width="1" height="1" fill="${color}"/>
    <rect class="gf-dot gf-dot-4" x="0" y="12" width="1" height="1" fill="${color}"/>`;
}

// A puffy pixel cloud the root Fetchy rides on (AM-10), in the expanded
// ROOT_VIEWBOX bottom region. Its own group so it stays put while only the pup
// bobs (GF-108 #4).
export const ROOT_CLOUD = `
    <rect class="gf-cloud" x="-4" y="28" width="32" height="4" fill="${CLOUD_FILL}"/>
    <rect class="gf-cloud" x="-1" y="25" width="26" height="3" fill="${CLOUD_FILL}"/>
    <rect class="gf-cloud" x="2" y="23" width="9" height="2" fill="${CLOUD_FILL}"/>
    <rect class="gf-cloud" x="14" y="22" width="9" height="3" fill="${CLOUD_FILL}"/>
    <rect class="gf-cloud" x="8" y="21" width="6" height="2" fill="${CLOUD_FILL}"/>`;
