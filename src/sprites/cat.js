// Cat — gray pixel cat sprite sheet (GF-118).
//
// Side-view feline (facing right): pointed ears, long expressive tail. Frames
// are 16×13 grids like every sheet; the engine mirrors for left.
//
// State motions: scratch(앞발 긁기+파편) / tailchase(꼬리 잡기 빙글빙글) /
// hiss(등 세우고 하악질) / mouse(쥐 물고 옴) / curl(몸 말고 잠) / perk(귀
// 쫑긋 두리번).

const PALETTE = {
  C: "#c9ced8", // fur
  S: "#969eab", // shade — tail, paws, stripes
  N: "#22262c", // eyes / nose / mouth
  P: "#ef9aac", // tongue / inner ear
  m: "#8d8d96", // caught mouse
  D: "#8a6f47", // scratched-up debris
};

/** Horizontal mirror for the tail-chase loop. */
const mirror = (grid) => grid.map((row) => [...row].reverse().join(""));

// Sitting upright, tail wrapped around the front paws.
const SIT = [
  "................",
  ".........C.C....",
  ".........CCC....",
  ".........CNC....",
  ".........CCC....",
  "........CCCC....",
  ".......CCCCC....",
  "......CCCCCC....",
  "..S..CCCCCCC....",
  "..SS.CCCCCCC....",
  "...SSCCCCCCC....",
  ".....CCCCCCC....",
  ".....CC..CC.....",
];

// Tail flicks up — the idle swish pair.
const SIT_FLICK = [
  "................",
  ".........C.C....",
  ".........CCC....",
  ".........CNC....",
  ".........CCC....",
  "..S.....CCCC....",
  "..S....CCCCC....",
  "..SS..CCCCCC....",
  "...S.CCCCCCC....",
  ".....CCCCCCC....",
  ".....CCCCCCC....",
  ".....CCCCCCC....",
  ".....CC..CC.....",
];

// Slinky stride, tail held high.
const WALKC_A = [
  "................",
  "..S.........C.C.",
  "..S.........CCC.",
  "..SS........CNC.",
  "...S........CCC.",
  "....CCCCCCCCCC..",
  "....CCCCCCCCCC..",
  "....CCCCCCCCC...",
  "....CCCCCCCCC...",
  "....CC.....CC...",
  "...CC.......CC..",
  "................",
  "................",
];

const WALKC_B = [
  "................",
  "..S.........C.C.",
  "..SS........CCC.",
  "...S........CNC.",
  "...S........CCC.",
  "....CCCCCCCCCC..",
  "....CCCCCCCCCC..",
  "....CCCCCCCCC...",
  "....CCCCCCCCC...",
  "......CC.CC.....",
  "......CC.CC.....",
  "................",
  "................",
];

// Scratch: rump high, front low, paws raking the ground, debris flying.
const SCRATCH_A = [
  "................",
  "..SS............",
  "..SS............",
  "...CCCCCC.......",
  "..CCCCCCCC.C.C..",
  "..CCCCCCCCCCC...",
  "..CC..CCCCCNC...",
  "..CC..CCCCCCC...",
  "..SS..CCCCCC....",
  ".......CC.......",
  ".......CC.DD....",
  "..........D.D...",
  "................",
];

const SCRATCH_B = [
  "................",
  "...SS...........",
  "...SS...........",
  "...CCCCCC.......",
  "..CCCCCCCC.C.C..",
  "..CCCCCCCCCCC...",
  "..CC..CCCCCNC...",
  "..CC..CCCCCCC...",
  "..SS..CCCCCC....",
  ".........CC.....",
  "......DD.CC.....",
  ".....D..D.......",
  "................",
];

// Tail-chase: body curled in a tight circle, nose at its own tail tip —
// mirrored back and forth it reads as spinning in place.
const CHASE = [
  "................",
  "................",
  "....C.C.........",
  "....CCC.........",
  "....CNCCCCC.....",
  "....CCCCCCCC....",
  "...CCCCCCCCC....",
  "...CCC...CCC....",
  "...CCC...SSC....",
  "...CCCC.SSCC....",
  "....CCCCCCC.....",
  ".....CCCCC......",
  "................",
];

// Hiss: the halloween-cat arch — back spiked, tail bolt upright, mouth open.
const HISS_A = [
  "................",
  ".S..............",
  ".S...C.C.C......",
  ".SS.CCCCCC......",
  "..SCCCCCCCC.C.C.",
  "...CCCCCCCCCCC..",
  "....CCCCCCCNCC..",
  "....CCCCCCCCNP..",
  "....CC....CCC...",
  "....CC....CC....",
  "....SS....CC....",
  "..........SS....",
  "................",
];

const HISS_B = [
  "................",
  ".S..............",
  ".SS..C.C.C......",
  "..S.CCCCCC......",
  "..SCCCCCCCC.C.C.",
  "...CCCCCCCCCCC..",
  "....CCCCCCCNCC..",
  "....CCCCCCCCNN..",
  "....CC....CCC...",
  "....CC....CC....",
  "....SS....CC....",
  "..........SS....",
  "................",
];

// Trophy mouse dangling from the mouth, tail swinging proudly.
const MOUSE_A = [
  "................",
  "..S.........C.C.",
  "..S.........CCC.",
  "..SS........CNC.",
  "...S........CCC.",
  "....CCCCCCCCCC..",
  "....CCCCCCCCCCm.",
  "....CCCCCCCCCmm.",
  "....CCCCCCCCC...",
  "....CC.....CC...",
  "....CC.....CC...",
  "................",
  "................",
];

const MOUSE_B = [
  "................",
  "..S.........C.C.",
  "..SS........CCC.",
  "...S........CNC.",
  "...S........CCC.",
  "....CCCCCCCCCC..",
  "....CCCCCCCCCCm.",
  "....CCCCCCCCCmm.",
  "....CCCCCCCCCm..",
  "....CC.....CC...",
  "....CC.....CC...",
  "................",
  "................",
];

// Curled sleep: a gray cinnamon roll with an ear poking out.
const CURL_A = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......C.C.......",
  "....CCCCCCC.....",
  "...CCCCCCCCC....",
  "..CCCCCCCCCCC...",
  "..CCCSSSSCCCC...",
  "..CCCCCCCCCCC...",
  "...CCCCCCCCC....",
  "................",
];

const CURL_B = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......C.C.......",
  "....CCCCCCC.....",
  "...CCCCCCCCC....",
  "..CCCCCCCCCCCC..",
  "..CCCSSSSCCCCC..",
  "..CCCCCCCCCCCC..",
  "...CCCCCCCCC....",
  "................",
];

// Perk: ears up, head swivels — something moved.
const PERK_L = [
  "................",
  ".........C.C....",
  ".........CCC....",
  ".........NCC....",
  ".........CCC....",
  "........CCCC....",
  ".......CCCCC....",
  "......CCCCCC....",
  "..S..CCCCCCC....",
  "..SS.CCCCCCC....",
  "...SSCCCCCCC....",
  ".....CCCCCCC....",
  ".....CC..CC.....",
];

const PERK_R = [
  "................",
  ".........C.C....",
  ".........CCC....",
  ".........CCN....",
  ".........CCC....",
  "........CCCC....",
  ".......CCCCC....",
  "......CCCCCC....",
  "..S..CCCCCCC....",
  "..SS.CCCCCCC....",
  "...SSCCCCCCC....",
  ".....CCCCCCC....",
  ".....CC..CC.....",
];

export default {
  name: "cat",
  size: [16, 13],
  palette: PALETTE,
  anims: {
    idle: { fps: 2, frames: [SIT, SIT_FLICK] },
    walk: { fps: 6, frames: [WALKC_A, WALKC_B] },
    walkFront: { fps: 6, frames: [WALKC_A, WALKC_B] },
    walkBack: { fps: 6, frames: [WALKC_A, WALKC_B] },
    scratch: { fps: 8, frames: [SCRATCH_A, SCRATCH_B] },
    tailchase: { fps: 4, frames: [CHASE, mirror(CHASE)] },
    hiss: { fps: 6, frames: [HISS_A, HISS_B] },
    mouse: { fps: 3, frames: [MOUSE_A, MOUSE_B] },
    curl: { fps: 1, frames: [CURL_A, CURL_B] },
    perk: { fps: 2, frames: [PERK_L, SIT, PERK_R, SIT] },
  },
  stateAnims: {
    working: "scratch",
    waiting: "tailchase",
    error: "hiss",
    done: "mouse",
    idle: "curl",
    pending: "perk",
  },
};
