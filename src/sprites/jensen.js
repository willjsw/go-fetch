// Jensen — leather-jacket tech-CEO caricature sprite sheet (GF-118; 32×26).
//
// Front-facing: swept gray hair, rimmed glasses, the trademark black leather
// jacket, and a glowing green GPU. While WORKING, ideas fly — a shower of
// NVIDIA-green sparks pops off his head, denser every frame (3f).
//
// Other motions: crossed(팔짱+발 구르기, 3f) / facepalm(이마 짚기, 3f) /
// present(GPU 번쩍, 3f) / doze(선 채로 꾸벅, 3f) / glance(좌우 살피기, 4f).

const PALETTE = {
  J: "#2b2e35", // leather jacket
  H: "#cfd2d6", // hair
  F: "#e6b48e", // skin
  N: "#1c1f24", // glasses / shoes
  G: "#76b900", // the GPU and its idea-sparks
  D: "#565b63", // pants / belt
  z: "#9ca3af", // doze Zz
};

const E = "................................";
const edit = (g, edits) => g.map((row, y) => edits[y] ?? row);
const shiftDown = (g, n) => Array(n).fill(E).concat(g.slice(0, g.length - n));

const STAND = [
  "................................",
  "................................",
  "................................",
  "............HHHHHHHH............",
  "...........HHHHHHHHHH...........",
  "...........HHHHHHHHHH...........",
  "...........FFFFFFFFFF...........",
  "...........NNNNFFNNNN...........",
  "...........FFFFFFFFFF...........",
  "............FFFFFFFF............",
  "..............FFFF..............",
  "........JJJJJJJJJJJJJJJJ........",
  ".......JJJJJJJJJJJJJJJJJJ.......",
  ".......JJ.JJJJJJJJJJJJ.JJ.......",
  ".......JJ.JJJJJJJJJJJJ.JJ.......",
  ".......JJ.JJJJJJJJJJJJ.JJ.......",
  ".......JJ.JJJJJJJJJJJJ.JJ.......",
  ".......FF.JJJJJJJJJJJJ.FF.......",
  "..........DDDDDDDDDDDD..........",
  "...........DD.....DD............",
  "...........DD.....DD............",
  "...........DD.....DD............",
  "...........DD.....DD............",
  "...........DD.....DD............",
  "..........NNN.....NNN...........",
  "................................",
];

// Idle nod: the head dips a pixel.
const STAND_NOD = edit(shiftDown(STAND, 1), {
  12: ".......JJJJJJJJJJJJJJJJJJ.......",
  13: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  14: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  15: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  16: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  17: ".......FF.JJJJJJJJJJJJ.FF.......",
  18: "..........DDDDDDDDDDDD..........",
  19: "...........DD.....DD............",
  20: "...........DD.....DD............",
  21: "...........DD.....DD............",
  22: "...........DD.....DD............",
  23: "...........DD.....DD............",
  24: "..........NNN.....NNN...........",
  25: "................................",
});

// Stride: legs scissor — 4-step cycle.
const STRIDE_A = edit(STAND, {
  19: ".........DD.........DD..........",
  20: ".........DD.........DD..........",
  21: ".........DD.........DD..........",
  22: "........DD...........DD.........",
  23: "........DD...........DD.........",
  24: ".......NNN...........NNN........",
});
const STRIDE_B = edit(STAND, {
  19: ".............DD.DD..............",
  20: ".............DD.DD..............",
  21: ".............DD.DD..............",
  22: ".............DD.DD..............",
  23: ".............DD.DD..............",
  24: "............NNN.NNN.............",
});

// WORKING — tinkering on the GPU at his waist while idea-sparks shower off
// his head, denser every frame. Rows 0-2 are the spark field.
const TINKER_BODY = edit(STAND, {
  13: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  14: ".......JJ..GGGGGGGGGG..JJ.......",
  15: ".......JJ.GGGGGGGGGGGG.JJ.......",
  16: ".......JJ.GGGGGGGGGGGG.JJ.......",
  17: ".......FF.GGGGGGGGGGGG.FF.......",
});
const TINKER_A = edit(TINKER_BODY, {
  0: "......G..........G..............",
  1: "..........G...........G.........",
  2: "....G...........................",
});
const TINKER_B = edit(TINKER_BODY, {
  0: "...G......G.........G....G......",
  1: ".......G.......G...........G....",
  2: ".G...........G.........G........",
});
const TINKER_C = edit(TINKER_BODY, {
  0: ".G...G....G....G....G....G...G..",
  1: "...G....G....G....G....G....G...",
  2: "G....G.....G.....G.....G.....G..",
});

// Arms crossed, toe tapping — waiting for the build (or for you).
const CROSSED = edit(STAND, {
  13: ".......JJJJJJJJJJJJJJJJJJ.......",
  14: ".......JJJJFFJJJJFFJJJJJJ.......",
  15: ".......JJJJJJJJJJJJJJJJJJ.......",
  16: "..........JJJJJJJJJJJJ..........",
  17: "..........JJJJJJJJJJJJ..........",
});
const CROSSED_TAP = edit(CROSSED, {
  23: "...........DD.....DD....N.......",
});
const CROSSED_TAP2 = edit(CROSSED, {
  23: "...........DD.....DD............",
  24: "..........NNN.....NNN..N........",
});

// Facepalm: one hand up over the glasses, head bowed, slow shake.
const PALM_A = edit(STAND, {
  7: "...........NNNNFFFFFF...........",
  8: "...........FFFFFFFFFF...........",
  13: ".......JJ.JJJJJJJJJJJJFFJ.......",
  14: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  17: ".......FF.JJJJJJJJJJJJ..........",
});
const PALM_B = edit(shiftDown(PALM_A, 1), {
  13: ".......JJ.JJJJJJJJJJJJFFJ.......",
  14: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  15: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  16: ".......JJ.JJJJJJJJJJJJ.JJ.......",
  17: ".......FF.JJJJJJJJJJJJ..........",
  18: "..........DDDDDDDDDDDD..........",
  19: "...........DD.....DD............",
  20: "...........DD.....DD............",
  21: "...........DD.....DD............",
  22: "...........DD.....DD............",
  23: "...........DD.....DD............",
  24: "..........NNN.....NNN...........",
  25: "................................",
});

// Present: the GPU held high overhead, glowing — keynote moment (3f sparkle).
const PRESENT_A = [
  "...........GGGGGGGGGG...........",
  "...........GGGGGGGGGG...........",
  "........FF............FF........",
  "........JJ..HHHHHHHH..JJ........",
  "........JJ.HHHHHHHHHH.JJ........",
  "........JJ.HHHHHHHHHH.JJ........",
  "........JJ.FFFFFFFFFF.JJ........",
  "........JJ.NNNNFFNNNN.JJ........",
  "........JJ.FFFFFFFFFF.JJ........",
  "........JJJ.FFFFFFFF.JJJ........",
  ".........JJJJJJJJJJJJJJ.........",
  ".........JJJJJJJJJJJJJJ.........",
  ".........JJJJJJJJJJJJJJ.........",
  ".........JJJJJJJJJJJJJJ.........",
  ".........JJJJJJJJJJJJJJ.........",
  ".........JJJJJJJJJJJJJJ.........",
  ".........JJJJJJJJJJJJJJ.........",
  ".........JJJJJJJJJJJJJJ.........",
  "..........DDDDDDDDDDDD..........",
  "...........DD.....DD............",
  "...........DD.....DD............",
  "...........DD.....DD............",
  "...........DD.....DD............",
  "...........DD.....DD............",
  "..........NNN.....NNN...........",
  "................................",
];

const PRESENT_B = edit(PRESENT_A, {
  0: "....G......GGGGGGGGGG......G....",
  1: "...........GGGGGGGGGG...........",
  2: "..G.....FF............FF.....G..",
});
const PRESENT_C = edit(PRESENT_A, {
  0: ".G.........GGGGGGGGGG.........G.",
  1: "......G....GGGGGGGGGG....G......",
  2: "........FF............FF........",
});

// Standing doze: head sunk, a Zz drifting up (3f).
const DOZE_A = edit(STAND_NOD, {
  0: "......................z.........",
  1: ".....................zz.........",
});
const DOZE_B = edit(STAND_NOD, {
  0: ".......................zz.......",
  1: "......................z.........",
});
const DOZE_C = edit(STAND_NOD, {
  1: "......................z.........",
  2: ".....................zz.........",
});

// Glance: the whole head slides a pixel left, then right.
const GLANCE_L = edit(STAND, {
  3: "...........HHHHHHHH.............",
  4: "..........HHHHHHHHHH............",
  5: "..........HHHHHHHHHH............",
  6: "..........FFFFFFFFFF............",
  7: "..........NNNNFFNNNN............",
  8: "..........FFFFFFFFFF............",
  9: "...........FFFFFFFF.............",
});
const GLANCE_R = edit(STAND, {
  3: ".............HHHHHHHH...........",
  4: "............HHHHHHHHHH..........",
  5: "............HHHHHHHHHH..........",
  6: "............FFFFFFFFFF..........",
  7: "............NNNNFFNNNN..........",
  8: "............FFFFFFFFFF..........",
  9: ".............FFFFFFFF...........",
});

const WALK = { fps: 7, frames: [STRIDE_A, STAND, STRIDE_B, STAND] };

export default {
  name: "jensen",
  size: [32, 26],
  palette: PALETTE,
  anims: {
    idle: { fps: 1.5, frames: [STAND, STAND_NOD] },
    walk: WALK,
    walkFront: WALK,
    walkBack: WALK,
    tinker: { fps: 8, frames: [TINKER_A, TINKER_B, TINKER_C, TINKER_B] },
    crossed: { fps: 3, frames: [CROSSED, CROSSED_TAP, CROSSED, CROSSED_TAP2] },
    facepalm: { fps: 2, frames: [PALM_A, PALM_B, PALM_A] },
    present: { fps: 5, frames: [PRESENT_A, PRESENT_B, PRESENT_C, PRESENT_B] },
    doze: { fps: 1.5, frames: [DOZE_A, DOZE_B, DOZE_C] },
    glance: { fps: 2, frames: [GLANCE_L, STAND, GLANCE_R, STAND] },
  },
  stateAnims: {
    working: "tinker",
    waiting: "crossed",
    error: "facepalm",
    done: "present",
    idle: "doze",
    pending: "glance",
  },
};
