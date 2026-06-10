// Cat — gray pixel cat sprite sheet (GF-118; 32×26 detail pass).
//
// Side-view feline (facing right): pointed ears, 2px eyes, long expressive
// tail. WORKING is now a toy: crouched low, rolling a ball back and forth
// between both front paws (양손으로 공 굴리기, 4f).
//
// Other motions: tailchase(꼬리 잡기 빙글빙글) / hiss(등 세우고 하악질, 3f) /
// mouse(쥐 물고 옴, 3f) / curl(몸 말고 잠, 3f) / perk(귀 쫑긋 두리번, 4f).

const PALETTE = {
  C: "#c9ced8", // fur
  S: "#969eab", // shade — tail, stripes, far legs
  N: "#22262c", // eyes / nose / mouth
  P: "#ef9aac", // tongue / inner ear
  m: "#8d8d96", // caught mouse
  o: "#f2a23c", // toy ball
};

const E = "................................";
const mirror = (grid) => grid.map((row) => [...row].reverse().join(""));
const edit = (g, edits) => g.map((row, y) => edits[y] ?? row);

// Sitting upright, tail wrapped around the front.
// Sitting upright: triangle ears, 2px eyes with a real gap, pink nose, striped
// haunch, vertical front legs, tail curled around the front paws.
const SIT = [
  "................................",
  ".................C.....C........",
  ".................CC...CC........",
  ".................CCC.CCC........",
  ".................CCCCCCC........",
  "................CCCCCCCCC.......",
  "................CNNCCCNNC.......",
  "................CNNCCCNNC.......",
  "................CCCCPCCCC.......",
  ".................CCCCCCC........",
  ".................CCCCCC.........",
  "...............CCCCCCCC.........",
  "..............CCCCCCCCC.........",
  ".............CCCCCCCCCC.........",
  "............CCCCCCCCCCC.........",
  "...........CCCCCCCCCCCC.........",
  "..........CCCCCCCCCCCCC.........",
  "..........CCCCCCCCCCCCC.........",
  "..........CCCCCSSCCCCCC.........",
  "..........CCCCC...CC..CC........",
  "..........CCCCC...CC..CC........",
  "....SS....CCCCC...CC..CC........",
  ".....SSSSSCCCCC..CCC.CCC........",
  "................................",
  "................................",
  "................................",
];

// Tail sweep: wrapped → lifting → flicked high, for a smooth idle swish.
const SIT_MID = edit(SIT, {
  19: "..S.......CCCCC...CC..CC........",
  20: "..SS......CCCCC...CC..CC........",
  21: "...SSS....CCCCC...CC..CC........",
  22: "..........CCCCC..CCC.CCC........",
});
const SIT_FLICK = edit(SIT, {
  16: "..S.......CCCCCCCCCCCCC.........",
  17: "..S.......CCCCCCCCCCCCC.........",
  18: "..SS......CCCCCSSCCCCCC.........",
  19: "...SS.....CCCCC...CC..CC........",
  20: "....SS....CCCCC...CC..CC........",
  21: ".....S....CCCCC...CC..CC........",
  22: "..........CCCCC..CCC.CCC........",
});

// Slinky stride, tail held high behind — 4-step cycle.
const WALKC_A = [
  "................................",
  "................................",
  "................................",
  "..S......................C....C.",
  "..S......................CC..CC.",
  "..SS.....................CCCCCC.",
  "...S.....................CCCCCC.",
  "...S.....................CNCCNC.",
  "....S....................CCNNCC.",
  "....S...................CCCCC...",
  ".....CCCCCCCCCCCCCCCCCCCCCCC....",
  ".....CCCCCCCCCCCCCCCCCCCCCC.....",
  ".....CCCCCCCCCCCCCCCCCCCC.......",
  ".....CCCCCCCCCCCCCCCCCCC........",
  ".....CCCCCCCCCCCCCCCCCCC........",
  ".....CC...SS.....CC...SS........",
  ".....CC...SS.....CC...SS........",
  "....CC...SS.....CC....SS........",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const WALKC_B = edit(WALKC_A, {
  15: ".......CC.SS....CC..SS..........",
  16: ".......CC.SS....CC..SS..........",
  17: ".......CC.SS....CC..SS..........",
});
const WALKC_C = edit(WALKC_A, {
  15: ".....SS...CC.....SS...CC........",
  16: ".....SS...CC.....SS...CC........",
  17: "....SS....CC....SS....CC........",
});

// WORKING — crouched low, rolling a toy ball between both front paws.
const BALL_BASE = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "..........C.....C...............",
  "..........CC...CC...............",
  "..........CCCCCCC...............",
  "..........CNNCCNNC......SS......",
  "..........CCCPCCCC.....SS.......",
  ".........CCCCCCCC....SSS........",
  "........CCCCCCCCCCSSSS..........",
  "........CCCCCCCCCCCC............",
  "........CCCCCCCCCCCC............",
  "........CC.CCCC.CC..............",
  "........CC.oooo.CC..............",
  "...........oooo.................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const BALL_L = edit(BALL_BASE, {
  18: "........CC.CC...CCC.............",
  19: "......oo.CC.....CC..............",
  20: ".....oooo.......................",
  21: ".....oooo.......................",
});
const BALL_R = edit(BALL_BASE, {
  18: "........CCC...CC.CC.............",
  19: "..........CC.....CC.oo..........",
  20: "....................oooo........",
  21: "....................oooo........",
});

// Tail-chase: body curled tight, nose at its own tail — mirrored back and
// forth it reads as spinning in place.
const CHASE = [
  "................................",
  "................................",
  "................................",
  "................................",
  "........C..C....................",
  "........CC.CC...................",
  "........CCCCCCCCCCCCC...........",
  "........CNCNCCCCCCCCCC..........",
  "........CCNCCCCCCCCCCCC.........",
  ".......CCCCCCCCCCCCCCCC.........",
  ".......CCCCC.......CCCCC........",
  ".......CCCC.........SSCC........",
  ".......CCCC........SSCCC........",
  ".......CCCCC.....SSCCCC.........",
  "........CCCCCCCCCCCCCC..........",
  "..........CCCCCCCCCC............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

// Hiss: the halloween-cat arch — spiked back, bolt tail, open mouth.
const HISS_A = [
  "................................",
  "................................",
  "..S.............................",
  "..S...C.C.C.C.C.................",
  "..SS..CCCCCCCCCC................",
  "...SCCCCCCCCCCCCCC...C..C.......",
  "....CCCCCCCCCCCCCCC..CC.C.......",
  "....CCCCCCCCCCCCCCCCCCCCC.......",
  "....CCCCCCCCCCCCCCCCCNCNC.......",
  "....CCCCCCCCCCCCCCCCCCCNN.......",
  "....CCCCCCCCCCCCCCCCCCCNP.......",
  "....CCC....CCC.....CCCCC........",
  "....CCC....CCC.....CCC..........",
  "....SSS....SSS.....CCC..........",
  "...................SSS..........",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const HISS_B = edit(HISS_A, {
  2: "..SS............................",
  3: "...S..C.C.C.C.C.................",
  9: "....CCCCCCCCCCCCCCCCCCCNN.......",
  10: "....CCCCCCCCCCCCCCCCCCCNN.......",
});
const HISS_C = edit(
  HISS_A.map((row) => "." + row.slice(0, 31)),
  {},
);

// Trophy mouse dangling from the mouth, tail swinging proudly (3f).
const mouseRows = {
  8: "....S....................CCNNCC.",
  9: "....S...................CCCCCm..",
  10: ".....CCCCCCCCCCCCCCCCCCCCCCCmm..",
  11: ".....CCCCCCCCCCCCCCCCCCCCCCm....",
};
const MOUSE_A = edit(WALKC_A, mouseRows);
const MOUSE_B = edit(WALKC_B, mouseRows);
const MOUSE_C = edit(WALKC_C, mouseRows);

// Curled sleep: a gray cinnamon roll, breathing.
const CURL_A = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "...........C..C.................",
  ".........CCCCCCCCCC.............",
  "........CCCCCCCCCCCC............",
  ".......CCCCCCCCCCCCCC...........",
  ".......CCCCSSSSSSCCCC...........",
  ".......CCCCCCCCCCCCCC...........",
  "........CCCCCCCCCCCC............",
  ".........CCCCCCCCCC.............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const CURL_B = edit(CURL_A, {
  12: "........CCCCCCCCCCCCC...........",
  13: ".......CCCCCCCCCCCCCCC..........",
  14: ".......CCCCSSSSSSCCCCC..........",
  15: ".......CCCCCCCCCCCCCCC..........",
});
const CURL_C = edit(CURL_A, {
  10: "................................",
  11: "...........C..C.................",
  12: ".........CCCCCCCCCC.............",
});

// Perk: ears up, eyes dart — something moved.
const PERK_L = edit(SIT, {
  6: "................NNCCCNNCC.......",
  7: "................NNCCCNNCC.......",
});
const PERK_R = edit(SIT, {
  6: "................CCNNCCCNN.......",
  7: "................CCNNCCCNN.......",
});

export default {
  name: "cat",
  size: [32, 26],
  palette: PALETTE,
  anims: {
    idle: { fps: 3, frames: [SIT, SIT_MID, SIT_FLICK, SIT_MID] },
    walk: { fps: 8, frames: [WALKC_A, WALKC_B, WALKC_C, WALKC_B] },
    walkFront: { fps: 8, frames: [WALKC_A, WALKC_B, WALKC_C, WALKC_B] },
    walkBack: { fps: 8, frames: [WALKC_A, WALKC_B, WALKC_C, WALKC_B] },
    ball: { fps: 8, frames: [BALL_L, BALL_BASE, BALL_R, BALL_BASE] },
    tailchase: { fps: 5, frames: [CHASE, mirror(CHASE)] },
    hiss: { fps: 8, frames: [HISS_A, HISS_B, HISS_C] },
    mouse: { fps: 4, frames: [MOUSE_A, MOUSE_B, MOUSE_C, MOUSE_B] },
    curl: { fps: 1.5, frames: [CURL_A, CURL_B, CURL_C] },
    perk: { fps: 2, frames: [PERK_L, SIT, PERK_R, SIT] },
  },
  stateAnims: {
    working: "ball",
    waiting: "tailchase",
    error: "hiss",
    done: "mouse",
    idle: "curl",
    pending: "perk",
  },
};
