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
 * Build the forest from the flat snapshot.
 * - Layer 1: a session with no `parent_session_id` is a direct child of root.
 * - Layer 2 (GF-108): a session whose `parent_session_id` matches a known
 *   session nests under it as a (smaller) sub-agent. If the parent isn't present
 *   (shouldn't happen — backend cleans orphans), it falls back to a root child.
 * @param {Array<object>} sessions flat snapshot from get_sessions
 * @returns {{id:string, role:string, depth:number, session:?object, children:Array}}
 */
export function buildForest(sessions = []) {
  const list = Array.isArray(sessions) ? sessions : [];
  const root = { id: ROOT_ID, role: "root", depth: 0, session: null, children: [] };

  // Pass 1: one node per session, so attachment is order-independent.
  const byId = new Map();
  for (const s of list) {
    byId.set(s.id, { id: s.id, role: "session", depth: 1, session: s, children: [] });
  }
  // Pass 2: attach to parent (sub-agent) or root (top-level session).
  for (const s of list) {
    const node = byId.get(s.id);
    const parentId = s.parent_session_id;
    const parent = parentId ? byId.get(parentId) : null;
    if (parent) {
      node.role = "subagent";
      node.depth = 2;
      parent.children.push(node);
    } else {
      node.role = "session";
      node.depth = 1;
      root.children.push(node);
    }
  }
  return root;
}

/** Pixel size for a node's role/tier (falls back to session size). */
export function tierSize(role) {
  return SIZE_TIERS[role] || SIZE_TIERS.session;
}
