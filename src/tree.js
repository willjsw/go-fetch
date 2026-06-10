// Session forest builder for the animated mode (Task 33 / GF-112).
//
// Converts the flat `get_sessions` snapshot into a tree rooted at the always-
// present Fetchy. **This is the only place that knows the parent→child data
// contract**, so Layer 2 (sub-agent nesting, GF-114+) plugs in here without
// touching the renderer: when the backend later carries `parent_id`/`agent_id`,
// attach those nodes under their parent instead of under the root.

import { SIZE_TIERS } from "./character-spec.js";

/** Synthetic id for the root node (Claude Code itself — has no session). */
export const ROOT_ID = "__fetchy_root__";

/**
 * Build the forest. Layer 1: every session is a direct child of the root.
 * @param {Array<object>} sessions flat snapshot from get_sessions
 * @returns {{id:string, role:string, depth:number, session:?object, children:Array}}
 */
export function buildForest(sessions = []) {
  const list = Array.isArray(sessions) ? sessions : [];
  const root = { id: ROOT_ID, role: "root", depth: 0, session: null, children: [] };
  for (const s of list) {
    // Layer 1: depth-1 child of root. (Layer 2 will branch on s.parent_id here.)
    root.children.push({
      id: s.id,
      role: "session",
      depth: 1,
      session: s,
      children: [],
    });
  }
  return root;
}

/** Pixel size for a node's role/tier (falls back to session size). */
export function tierSize(role) {
  return SIZE_TIERS[role] || SIZE_TIERS.session;
}
