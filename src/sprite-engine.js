// Frame-based pixel-sprite engine (GF-115).
//
// A sprite *sheet* is plain data (see src/sprites/*.js): a palette mapping
// single characters to CSS colors, plus named animations whose frames are
// arrays of equal-length strings — one character per pixel, "." or " " for
// transparent. The grid text IS the artwork, so frames stay reviewable in any
// monospace diff. The engine turns frames into run-length-merged <rect> rows
// inside one inline SVG and flips frame visibility on a single shared
// requestAnimationFrame ticker, so adding characters never adds timers.
//
// Motion accessibility: the ticker freezes on frame 0 under
// prefers-reduced-motion and stops advancing entirely while the document is
// hidden (G1 — the ambient widget must not burn battery unwatched).

/** Palette sentinel: pixels with this value take the per-state accent color. */
export const STATE_PIXEL = "@state";

const TRANSPARENT = ".";

/**
 * Render one frame grid to SVG <rect> markup, merging horizontal runs of the
 * same color so a 16×16 frame costs tens of nodes, not hundreds.
 * @param {string[]} grid rows of palette characters
 * @param {Record<string,string>} palette char → CSS color (or STATE_PIXEL)
 * @param {string} stateColor substituted for STATE_PIXEL pixels
 * @returns {string} <rect …/> markup
 */
export function frameToRects(grid, palette, stateColor) {
  let out = "";
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === TRANSPARENT || ch === " " || !palette[ch]) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const color = palette[ch] === STATE_PIXEL ? stateColor : palette[ch];
      out += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`;
      x = end;
    }
  }
  return out;
}

/**
 * Build the full sprite SVG for one animation: every frame as a <g> (only the
 * first visible), an optional static overlay grid (e.g. the root's collar)
 * drawn above all frames, wrapped in a flip group so facing left is one
 * transform — frames are only ever authored facing right.
 */
function buildSvg(sheet, anim, stateColor, overlayGrid, flip, palette = sheet.palette) {
  const [w, h] = sheet.size;
  const frames = anim.frames
    .map(
      (grid, i) =>
        `<g class="spr-frame"${i === 0 ? "" : ' style="display:none"'}>${frameToRects(grid, palette, stateColor)}</g>`,
    )
    .join("");
  const overlay = overlayGrid
    ? `<g class="spr-overlay">${frameToRects(overlayGrid, palette, stateColor)}</g>`
    : "";
  const flipAttr = flip ? ` transform="translate(${w} 0) scale(-1 1)"` : "";
  return `<svg class="spr" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g class="spr-flip"${flipAttr}>${frames}${overlay}</g></svg>`;
}

// ---------------------------------------------------------------------------
// Shared ticker: one rAF loop drives every live animator.
// ---------------------------------------------------------------------------

const animators = new Set();
let rafId = null;

const reducedMotion =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

function loop(now) {
  rafId = null;
  if (animators.size === 0) return;
  // Hidden window: keep the loop parked until visibility returns (resumed by
  // the visibilitychange listener below), advancing nothing meanwhile.
  if (typeof document !== "undefined" && document.hidden) return;
  if (!reducedMotion.matches) {
    for (const a of animators) a._tick(now);
  }
  rafId = requestAnimationFrame(loop);
}

function ensureLoop() {
  if (rafId === null && animators.size > 0) rafId = requestAnimationFrame(loop);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ensureLoop();
  });
}

// ---------------------------------------------------------------------------

/**
 * Animates one character host element through a sheet's named animations.
 * Construct once per character node; call `setAnim` whenever the visual state
 * changes and `destroy` when the node despawns.
 */
export class SpriteAnimator {
  /**
   * @param {HTMLElement} host container that receives the sprite <svg>
   * @param {object} sheet sprite sheet data (palette/size/anims/overlays)
   * @param {object} [opts]
   * @param {string} [opts.overlay] key into sheet.overlays drawn on top
   * @param {Record<string,string>} [opts.palette] per-animator palette
   *   override merged over the sheet's — e.g. the root dog turns its baked-in
   *   collar pixels red while everyone else renders them as coat (GF-118 fix:
   *   the collar moves with each pose instead of floating as an overlay).
   */
  constructor(host, sheet, opts = {}) {
    this.host = host;
    this.sheet = sheet;
    this.overlayKey = opts.overlay || null;
    this.palette = opts.palette ? { ...sheet.palette, ...opts.palette } : sheet.palette;
    this.animName = null;
    this.stateColor = "";
    this.flip = false;
    this.frame = 0;
    this.nextAt = 0;
    this.frameEls = [];
    animators.add(this);
    ensureLoop();
  }

  /** Switch animation (and/or accent color); no-op when nothing changed. */
  setAnim(name, stateColor = "") {
    const anim = this.sheet.anims[name] ? name : "idle";
    if (anim === this.animName && stateColor === this.stateColor) return;
    this.animName = anim;
    this.stateColor = stateColor;
    this._rebuild();
  }

  /** Face left (true) or right (false — the authored direction). */
  setFlip(flip) {
    if (flip === this.flip) return;
    this.flip = flip;
    const g = this.host.querySelector(".spr-flip");
    if (g) {
      const [w] = this.sheet.size;
      if (flip) g.setAttribute("transform", `translate(${w} 0) scale(-1 1)`);
      else g.removeAttribute("transform");
    }
  }

  destroy() {
    animators.delete(this);
  }

  _rebuild() {
    const anim = this.sheet.anims[this.animName];
    const overlay = this.overlayKey ? (this.sheet.overlays || {})[this.overlayKey] : null;
    this.host.innerHTML = buildSvg(this.sheet, anim, this.stateColor, overlay, this.flip, this.palette);
    this.frameEls = Array.from(this.host.querySelectorAll(".spr-frame"));
    this.frame = 0;
    this.nextAt = 0; // advance on the next tick
  }

  _tick(now) {
    const anim = this.sheet.anims[this.animName];
    if (!anim || this.frameEls.length < 2) return;
    if (this.nextAt === 0) {
      this.nextAt = now + 1000 / (anim.fps || 4);
      return;
    }
    if (now < this.nextAt) return;
    this.nextAt = now + 1000 / (anim.fps || 4);
    const prev = this.frameEls[this.frame];
    this.frame = (this.frame + 1) % this.frameEls.length;
    const next = this.frameEls[this.frame];
    if (prev) prev.style.display = "none";
    if (next) next.style.display = "";
  }
}

/**
 * Static first frame of an animation as standalone SVG markup — for places
 * that want the character's look without a live animator (cards, detail view).
 */
export function spriteFrameSvg(sheet, animName, stateColor = "", overlayKey = null) {
  const anim = sheet.anims[animName] || sheet.anims.idle;
  const overlay = overlayKey ? (sheet.overlays || {})[overlayKey] : null;
  return buildSvg(sheet, { ...anim, frames: [anim.frames[0]] }, stateColor, overlay, false);
}
