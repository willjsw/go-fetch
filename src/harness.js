// Harness (leash) overlay for the animated mode (Task 33 / GF-112).
//
// A single <svg> layer behind the character nodes draws one bezier "leash" per
// parent→child link. Kept as one SVG (not per-node) so redrawing on layout is a
// cheap `d`-attribute rebuild. Line color = the child session's state color.

import { STATE_COLOR } from "./character-spec.js";
import { visualKey } from "./utils.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Ensure the single harness <svg> exists as the stage's first child (behind nodes). */
export function ensureHarnessLayer(stage) {
  let svg = stage.querySelector("svg.harness-layer");
  if (!svg) {
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "harness-layer");
    svg.setAttribute("aria-hidden", "true");
    stage.insertBefore(svg, stage.firstChild);
  }
  return svg;
}

/**
 * Redraw all leashes.
 * @param {SVGElement} svg the harness layer
 * @param {Array<{from:{x:number,y:number}, to:{x:number,y:number}, session:?object}>} links
 * @param {number} w stage width
 * @param {number} h stage height
 */
export function drawHarness(svg, links, w, h) {
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  // One <path> per link; rebuilt each layout (handful of nodes → cheap).
  svg.replaceChildren();
  for (const { from, to, session } of links) {
    const path = document.createElementNS(SVG_NS, "path");
    // Downward sag between the two anchors for a "hanging leash" feel.
    const sag = Math.min(26, Math.abs(to.y - from.y) * 0.25 + 8);
    const midY = (from.y + to.y) / 2 + sag;
    path.setAttribute(
      "d",
      `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`,
    );
    const state = session ? visualKey(session) : "idle";
    path.setAttribute("stroke", STATE_COLOR[state] || STATE_COLOR.idle);
    path.setAttribute("class", "harness-line");
    svg.appendChild(path);
  }
}
