// Fetchy — white pixel dog sprite sheet (GF-115 base, GF-117 full motions).
//
// Frames are 16×13 character grids ("." = transparent), authored FACING RIGHT;
// the engine mirrors for left, and `mirror()` below bakes mirrored frames where
// a turn-around needs them (spin / look-around). Coat is white with one gray
// shade (필연적 음영만) so the dog stays in the flat 2D-dot palette. The red
// collar is an overlay applied only to the root (Claude Code) dog.
//
// State motions (GF-117):
//   working → dig   땅을 열심히 파헤치고 흙이 튄다
//   waiting → spin  제자리에서 빙글빙글 돈다 (옆→정면→옆→뒤)
//   error   → growl 자세를 낮추고 이빨을 드러내며 으르릉
//   done    → fetch 뼈를 물고 신나게 꼬리를 흔든다
//   idle    → sleep 엎드려 잠 (Zz)
//   pending → look  두리번거리며 상황 파악

const PALETTE = {
  W: "#f4f4ef", // white coat
  S: "#cfcfc6", // shade — ears, tail, paws
  N: "#26262b", // eye / nose / mouth
  P: "#ef9aac", // tongue
  R: "#d9413d", // collar (root overlay)
  G: "#f0c75e", // collar tag
  D: "#8a6f47", // flying dirt
  B: "#efe6c8", // fetched bone
  A: "#e8554d", // growl anger sparks
  z: "#9ca3af", // sleep Zz
};

/** Horizontal mirror — for turn-around frames (palette has no directional chars). */
const mirror = (grid) => grid.map((row) => [...row].reverse().join(""));

// ---- Side poses --------------------------------------------------------------

// Standing: floppy ear, snout right with a 2px nose, tail raised, four legs.
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

// ---- Facing poses (spin / look-around / pseudo-3D vertical walk) --------------

// Facing the viewer: both ears, two eyes, center nose.
const FRONT = [
  "................",
  "....SS....SS....",
  "....SWWWWWWS....",
  "....WWWWWWWW....",
  "....WNWWWWNW....",
  "....WWWNNWWW....",
  ".....WWWWWW.....",
  "....WWWWWWWW....",
  "....WWWWWWWW....",
  "....WWWWWWWW....",
  "....WW....WW....",
  "....WW....WW....",
  "....SS....SS....",
];

// Facing away: no face, tail against the back.
const BACK = [
  "................",
  "....SS....SS....",
  "....SWWWWWWS....",
  "....WWWWWWWW....",
  "....WWWWWWWW....",
  "....WWWWWWWW....",
  ".....WWWWWW.....",
  "....WWWWWWWW....",
  "....WWWSSWWW....",
  "....WWWSSWWW....",
  "....WW....WW....",
  "....WW....WW....",
  "....SS....SS....",
];

/** Step shuffle for front/back walking: alternate which paw is planted. */
const stepLeft = (grid) =>
  grid.slice(0, 12).concat(["....SS.........."]);
const stepRight = (grid) =>
  grid.slice(0, 12).concat(["..........SS...."]);

// ---- working: dig ------------------------------------------------------------

// Crouched over the spot — rump high with the tail whipping, head down with the
// nose at the ground, front paw scratching while dirt flies forward.
const DIG_A = [
  "................",
  ".SS.............",
  ".SS.............",
  "..SWWWWWW.......",
  "..WWWWWWWWW.....",
  "..WWWWWWWWWSS...",
  "..WWWWWWWWWWW...",
  "..WW..WWWWNWWW..",
  "..WW..WWWWWWWNN.",
  "..SS..WWWWWWWW..",
  "........WW......",
  "........WW.DD...",
  "...........D.D..",
];

const DIG_B = [
  "................",
  "..SS............",
  "..SS............",
  "..SWWWWWW.......",
  "..WWWWWWWWW.....",
  "..WWWWWWWWWSS...",
  "..WWWWWWWWWWW...",
  "..WW..WWWWNWWW..",
  "..WW..WWWWWWWNN.",
  "..SS..WWWWWWWW..",
  "..........WW....",
  ".......DD.WW....",
  "......D..D......",
];

const DIG_C = [
  "................",
  ".SS.............",
  ".SS.............",
  "..SWWWWWW.......",
  "..WWWWWWWWW.....",
  "..WWWWWWWWWSS...",
  "..WWWWWWWWWWW...",
  "..WW..WWWWNWWW..",
  "..WW..WWWWWWWNN.",
  "..SS..WWWWWWWW..",
  ".........WW...DD",
  "........WW...D..",
  "............D...",
];

// ---- error: growl --------------------------------------------------------------

// Low aggressive crouch — ears pinned back, bared teeth (alternating fangs),
// anger sparks flicking above the head.
const GROWL_A = [
  "................",
  ".............A..",
  "...........A.A..",
  "................",
  ".SS....SS.......",
  ".SWWWWWSWWWW....",
  ".WWWWWWWWWWWW...",
  ".WWWWWWWWWNWW...",
  ".WWWWWWWWWWWNN..",
  "..WWWWWWWNWNW...",
  "..WW...WW.......",
  "..WW...WW.......",
  "..SS...SS.......",
];

const GROWL_B = [
  "................",
  "..............A.",
  "............A...",
  "................",
  "..SS....SS......",
  "..SWWWWWSWWWW...",
  "..WWWWWWWWWWWW..",
  "..WWWWWWWWWNWW..",
  "..WWWWWWWWWWWNN.",
  "...WWWWWWWNWNW..",
  "...WW...WW......",
  "...WW...WW......",
  "...SS...SS......",
];

// ---- done: fetch ----------------------------------------------------------------

// Proudly carrying a bone (double-knob ends), tail whipping side to side.
const FETCH_A = [
  "................",
  ".........SS.....",
  ".......SWWW.....",
  ".SS....WWWWWW...",
  ".SS...WWWWNWWW..",
  "..S..WWWWWWWB..B",
  "..S..WWWWWWWBBBB",
  "...WWWWWWWWWB..B",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "....WW....WW....",
  "....WW....WW....",
  "....SS....SS....",
];

const FETCH_B = [
  "................",
  ".........SS.....",
  ".......SWWW.....",
  ".......WWWWWW...",
  "......WWWWNWWW..",
  ".....WWWWWWWB..B",
  "SSS..WWWWWWWBBBB",
  "...WWWWWWWWWB..B",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "....WW...WW.....",
  "....WW...WW.....",
  "....SS...SS.....",
];

// ---- idle: sleep -----------------------------------------------------------------

// Curled flat on the ground, eye closed, Zz drifting up.
const SLEEP_A = [
  "................",
  "................",
  "..........zz....",
  "...........z....",
  "................",
  "................",
  "................",
  "................",
  "..SS............",
  "..SWWWWWWW......",
  ".WWWWWWWWWWWW...",
  ".WWWWWWWWWNWWN..",
  ".SWWWWWWWWWWWW..",
];

const SLEEP_B = [
  "................",
  "................",
  "................",
  "..........zz....",
  "...........z....",
  "................",
  "................",
  "................",
  "..SS............",
  "..SWWWWWWWW.....",
  ".WWWWWWWWWWWW...",
  ".WWWWWWWWWNWWN..",
  ".SWWWWWWWWWWWW..",
];

// ---- Overlays ---------------------------------------------------------------------

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
    walkFront: { fps: 5, frames: [stepLeft(FRONT), stepRight(FRONT)] },
    walkBack: { fps: 5, frames: [stepLeft(BACK), stepRight(BACK)] },
    dig: { fps: 8, frames: [DIG_A, DIG_B, DIG_A, DIG_C] },
    spin: { fps: 5, frames: [STAND, FRONT, mirror(STAND), BACK] },
    growl: { fps: 6, frames: [GROWL_A, GROWL_B] },
    fetch: { fps: 4, frames: [FETCH_A, FETCH_B] },
    sleep: { fps: 1.5, frames: [SLEEP_A, SLEEP_B] },
    look: { fps: 1.5, frames: [STAND, FRONT, mirror(STAND), FRONT] },
  },
  stateAnims: {
    working: "dig",
    waiting: "spin",
    error: "growl",
    done: "fetch",
    idle: "sleep",
    pending: "look",
  },
};
