// Fetchy — white pixel dog sprite sheet (GF-115 base set).
//
// Frames are 16×13 character grids ("." = transparent), authored FACING RIGHT;
// the engine mirrors for left. Coat is white with a single gray shade (음영) so
// the dog stays in the flat 2D-dot palette the widget wants. The red collar is
// an overlay applied only to the root (Claude Code) dog.
//
// GF-115 ships the base poses (idle tail-wag + 2-frame walk); the full
// per-state motion set (dig / spin / growl / fetch …) lands with GF-117.

const PALETTE = {
  W: "#f4f4ef", // white coat
  S: "#cfcfc6", // shade — ears, tail, paws
  N: "#26262b", // eye / nose
  P: "#ef9aac", // tongue
  R: "#d9413d", // collar (root overlay)
  G: "#f0c75e", // collar tag
};

// Standing pose: floppy ear top-left of the head, snout right with a 2px nose,
// tail raised behind, four legs (two visible pairs).
const STAND = [
  "................",
  ".........SS.....",
  ".......SWWW.....",
  ".SS....WWWWWW...",
  ".SS...WWWWNWWW..",
  "..S..WWWWWWWWNN.",
  "..S..WWWWWWWWW..",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "....WW....WW....",
  "....WW....WW....",
  "....SS....SS....",
];

// Idle frame 2: the raised tail drops to horizontal — a slow ambient wag.
const STAND_TAIL_DOWN = [
  "................",
  ".........SS.....",
  ".......SWWW.....",
  ".......WWWWWW...",
  "......WWWWNWWW..",
  ".....WWWWWWWWNN.",
  "SSS..WWWWWWWWW..",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "....WW....WW....",
  "....WW....WW....",
  "....SS....SS....",
];

// Walk A: stride — legs extended apart, body up.
const WALK_A = [
  "................",
  ".........SS.....",
  ".......SWWW.....",
  ".SS....WWWWWW...",
  ".SS...WWWWNWWW..",
  "..S..WWWWWWWWNN.",
  "..S..WWWWWWWWW..",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "...WW......WW...",
  "...WW......WW...",
  "...SS......SS...",
];

// Walk B: pass — legs gathered, body dipped 1px (mid-stride crouch).
const WALK_B = [
  "................",
  "................",
  ".........SS.....",
  ".......SWWW.....",
  ".SS....WWWWWW...",
  ".SS...WWWWNWWW..",
  "..S..WWWWWWWWNN.",
  "..S..WWWWWWWWW..",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  ".....WW..WW.....",
  ".....SS..SS.....",
];

// Red collar + gold tag at the neck — drawn over every frame, root only.
const COLLAR = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "......RRRR......",
  ".......G........",
  "................",
  "................",
  "................",
  "................",
];

export default {
  name: "dog",
  size: [16, 13],
  palette: PALETTE,
  overlays: { collar: COLLAR },
  anims: {
    idle: { fps: 2, frames: [STAND, STAND_TAIL_DOWN] },
    walk: { fps: 6, frames: [WALK_A, WALK_B] },
  },
  // Visual state → animation. GF-117 replaces these with dedicated motions
  // (dig / spin / growl / fetch / sleep / look-around).
  stateAnims: {
    working: "walk",
    waiting: "idle",
    error: "idle",
    done: "idle",
    idle: "idle",
    pending: "idle",
  },
};
