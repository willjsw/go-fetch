// Fetchy — golden retriever sprite sheet (GF-115/117; 32×26 retriever pass).
//
// Frames are 32×26 character grids ("." = transparent), authored FACING RIGHT;
// the engine mirrors for left. This pass remodels Fetchy as a RETRIEVER: light
// golden coat, darker floppy ears, cream muzzle/chest, feathered tail — and
// bumps every motion to 3-4 frames for smoother animation.
//
// State motions:
//   working → dig   땅을 열심히 파헤치고 흙이 튄다 (4f)
//   waiting → spin  제자리에서 빙글빙글 (옆→정면→옆→뒤, 4f)
//   error   → growl 자세를 낮추고 이빨을 드러내며 으르릉 (3f)
//   done    → fetch 코랄 사각 AI 캐릭터(앱 아이콘과 동일)를 물고 꼬리를 흔든다 (3f)
//   idle    → sleep 엎드려 잠, 숨이 오르내림 (3f)
//   pending → look  두리번 (4f)

const PALETTE = {
  g: "#ecc888", // golden coat
  s: "#c89a52", // coat shade — tail feathering, far legs
  e: "#b9842f", // floppy ears
  c: "#f6ead0", // cream muzzle / chest
  N: "#26262b", // eyes / nose / mouth
  P: "#ef9aac", // tongue
  R: "#ecc888", // collar pixels — coat-colored by default (invisible);
  T: "#ecc888", // the ROOT's palette override turns R/T red/gold (rootPalette)
  D: "#8a6f47", // flying dirt
  o: "#d97757", // fetched AI buddy — the coral square friend from the app icon
  q: "#bc5f41", // AI buddy bottom shading
  A: "#e8554d", // growl anger sparks
  z: "#9ca3af", // sleep Zz
};

const E = "................................";
const mirror = (grid) => grid.map((row) => [...row].reverse().join(""));
const shiftDown = (g, n) => Array(n).fill(E).concat(g.slice(0, g.length - n));
const edit = (g, edits) => g.map((row, y) => edits[y] ?? row);

// ---- Side pose ---------------------------------------------------------------

// Standing: broad retriever head, floppy ear, cream muzzle with a 2px nose,
// feathered tail raised, cream chest, four legs (far pair shaded).
const STAND = [
  "................................",
  "................................",
  "...................gggggg.......",
  "..................gggggggg......",
  ".................eegggggggg.....",
  "..ss.............eeggggggggg....",
  ".sss.............eeggggNNgggg...",
  ".sgs.............eeggggggccccNN.",
  ".sggs............eegggggg.cccc..",
  "..sggs............gggggccccc....",
  "...sggs...........gRRRRRg.......",
  "....sggggggggggggggggTggg.......",
  ".......gggggggggggggggggg.......",
  ".......gggggggggggccccc.........",
  ".......gggggggggggccccc.........",
  ".......gggggggggggccccc.........",
  ".......gggggggggggccccc.........",
  "........ggggggggggcccc..........",
  "........gggggggggggggg..........",
  ".........gggggggggggg...........",
  "........gg..ss....gg..ss........",
  "........gg..ss....gg..ss........",
  "........gg..ss....gg..ss........",
  "........gg..ss....gg..ss........",
  "........ggg.ss....ggg.ss........",
  "................................",
];

// Tail mid (sweeping out) and low — the smooth 4-step ambient wag.
const TAIL_MID = edit(STAND, {
  5: ".................eeggggggggg....",
  6: ".................eeggggNNgggg...",
  7: ".................eeggggggccccNN.",
  8: "ss...............eegggggg.cccc..",
  9: "sggs..............gggggccccc....",
  10: ".sggs.............gRRRRRg.......",
});

const TAIL_LOW = edit(STAND, {
  5: ".................eeggggggggg....",
  6: ".................eeggggNNgggg...",
  7: ".................eeggggggccccNN.",
  8: ".................eegggggg.cccc..",
  9: "..................gggggccccc....",
  10: "ss................gRRRRRg.......",
  11: "sggggggggggggggggggggTggg.......",
});

// Walk: 4-frame cycle — contact / pass / opposite contact / pass.
const WALK_A = edit(STAND, {
  20: "......gg.....ss...gg.....ss.....",
  21: "......gg.....ss...gg.....ss.....",
  22: "......gg.....ss...gg.....ss.....",
  23: "......gg.....ss...gg.....ss.....",
  24: "......ggg....ss...ggg....ss.....",
});
const WALK_B = edit(shiftDown(STAND, 1), {
  21: "..........gg.ss...gg.ss.........",
  22: "..........gg.ss...gg.ss.........",
  23: "..........gg.ss...gg.ss.........",
  24: "..........gg.ss...gg.ss.........",
  25: "..........ggg.ss..ggg.ss........",
});
const WALK_C = edit(TAIL_MID, {
  20: "......ss.....gg...ss.....gg.....",
  21: "......ss.....gg...ss.....gg.....",
  22: "......ss.....gg...ss.....gg.....",
  23: "......ss.....gg...ss.....gg.....",
  24: "......ss....ggg...ss....ggg.....",
});

// ---- Facing poses (spin / look / vertical walk) --------------------------------

// Facing the viewer: floppy ears both sides, two 2px eyes, cream muzzle.
const FRONT = [
  "................................",
  "................................",
  "................................",
  ".........gggggggggggg...........",
  "........gggggggggggggg..........",
  ".......eeggggggggggggee.........",
  ".......eeggggggggggggee.........",
  ".......eegggNNggNNgggee.........",
  ".......eegggNNggNNgggee.........",
  ".......eeggggccccggggee.........",
  ".......eegggccNNccgggee.........",
  "........ggggccccccgggg..........",
  ".........gggggggggggg...........",
  ".........gRRRRRRRRRRg...........",
  "........ggggcccTccgggg..........",
  "........ggggccccccgggg..........",
  "........ggggccccccgggg..........",
  "........ggggccccccgggg..........",
  "........ggggccccccgggg..........",
  ".........gggggggggggg...........",
  ".........gg........gg...........",
  ".........gg........gg...........",
  ".........gg........gg...........",
  ".........gg........gg...........",
  ".........ggg.......ggg..........",
  "................................",
];

// Facing away: plain back, feathered tail swishing against it.
const BACK = edit(FRONT, {
  7: ".......eeggggggggggggee.........",
  8: ".......eeggggggggggggee.........",
  9: ".......eeggggggggggggee.........",
  10: ".......eeggggggggggggee.........",
  11: "........gggggggggggggg..........",
  14: "........ggggggssgggggg..........",
  15: "........gggggssssggggg..........",
  16: "........gggggssssggggg..........",
  17: "........ggggggssgggggg..........",
  18: "........gggggggggggggg..........",
});

// Front/back stepping: alternate planted paws.
const stepA = (g) =>
  edit(g, {
    22: ".........gg.....................",
    23: ".........gg.....................",
    24: ".........ggg.......ggg..........",
  });
const stepB = (g) =>
  edit(g, {
    22: "...................gg...........",
    23: "...................gg...........",
    24: ".........ggg.......ggg..........",
  });

// ---- working: dig --------------------------------------------------------------

// Crouched over the spot: rump and feathered tail high, head buried forward,
// front paws raking while dirt sprays. Authored high, then dropped to the
// ground line with shiftDown.
const DIG_RAW = [
  "................................",
  "...ss...........................",
  "...ss...........................",
  "..ss............................",
  "..ssgggggg......................",
  "..s.gggggggggg..................",
  "....gggggggggggggg..............",
  "....ggggggggggggggggg...........",
  "....gg..ggggggggggggggee........",
  "....gg..gggggggggggggggee.......",
  "....gg..ggggggggggRRRRgee.......",
  "....ss..ggggggggggNNgggg........",
  "........gggggggggggggggcccc.....",
  "..........ggggggggggggccccccNN..",
  "............gggggggggcccccc.....",
  "..............ggg..ggg..........",
  "..............ggg..ggg....DD....",
  "..............ggg..ggg...D..D...",
  ".............................D..",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const dig = (edits) => shiftDown(edit(DIG_RAW, edits), 6);

const DIG_A = dig({});
const DIG_B = dig({
  1: "....ss..........................",
  2: "...ss...........................",
  15: "..............ggg...ggg.........",
  16: ".........DD...ggg...ggg.........",
  17: "........D..D..ggg...ggg.........",
  18: "...........D....................",
});
const DIG_C = dig({
  1: "..ss............................",
  2: "..ss............................",
  15: "...............ggg.ggg..........",
  16: "...............ggg.ggg..DD..DD..",
  17: "...............ggg.ggg.D..D.....",
  18: "......................D....D....",
});
const DIG_D = dig({
  16: "..............ggg..ggg..........",
  17: "..............ggg..ggg..........",
  18: "................................",
});

// ---- error: growl --------------------------------------------------------------

// Long low crouch: ears pinned back, bared alternating teeth, tongue flash,
// anger sparks popping above.
const GROWL_BASE = [
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
  "...................A...A........",
  ".....................A..........",
  "................................",
  "..ss......ee....................",
  "..ssggggggeegggg................",
  "....ggggggggggRRRRgg............",
  "....ggggggggggggggNNggggNN......",
  "....ggggggggggggggggggggcccc....",
  ".....ggggggggggggggggNcNcNc.....",
  ".....gggggggggggggggggPP........",
  "....gg...gg.......gg...gg.......",
  "....gg...gg.......gg...gg.......",
  "....ss...ss.......ss...ss.......",
  "................................",
  "................................",
  "................................",
];

const GROWL_A = GROWL_BASE;
const GROWL_B = edit(
  GROWL_BASE.map((row) => "." + row.slice(0, 31)),
  {
    10: "......................A.........",
    11: "....................A...A.......",
  },
);
const GROWL_C = edit(GROWL_BASE, {
  10: "..................A.....A.......",
  11: "................................",
  13: "...ss.....ee....................",
  14: "...sggggggeegggg................",
});

// ---- done: fetch ----------------------------------------------------------------

// Done = the dog trots back with its prize: the square coral AI buddy (the
// same little guy as the app icon — slim eyes, tiny smile, shaded base)
// gripped in its mouth and hanging below the nose, while the feathered tail
// sweeps through three positions for a smooth happy wag.
const FETCH_A = edit(STAND, {
  8: ".sggs............eegggggg.ooooo.",
  9: "..sggs............gggggccooooooo",
  10: "...sggs...........gRRRRRgooNooNo",
  11: "....sggggggggggggggggTgggooNooNo",
  12: ".......ggggggggggggggggggooooooo",
  13: ".......gggggggggggccccc..oooNNoo",
  14: ".......gggggggggggccccc...qqqqq.",
});
const FETCH_B = edit(TAIL_MID, {
  8: "ss...............eegggggg.ooooo.",
  9: "sggs..............gggggccooooooo",
  10: ".sggs.............gRRRRRgooNooNo",
  11: "....sggggggggggggggggTgggooNooNo",
  12: ".......ggggggggggggggggggooooooo",
  13: ".......gggggggggggccccc..oooNNoo",
  14: ".......gggggggggggccccc...qqqqq.",
});
const FETCH_C = edit(TAIL_LOW, {
  8: ".................eegggggg.ooooo.",
  9: "..................gggggccooooooo",
  10: "ss................gRRRRRgooNooNo",
  11: "sggggggggggggggggggggTgggooNooNo",
  12: ".......ggggggggggggggggggooooooo",
  13: ".......gggggggggggccccc..oooNNoo",
  14: ".......gggggggggggccccc...qqqqq.",
});

// ---- idle: sleep -----------------------------------------------------------------

// Flat on the ground, eye closed, chest rising, Zz drifting.
const SLEEP_A = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "....................zz..........",
  ".....................z..........",
  "...................zz...........",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "...ss...........................",
  "...ssggggggggggggg..............",
  "..sgggggggggggggggggg...........",
  "..ggggggggggggggggggggggee......",
  ".gggggggggggggggggggggNggggg....",
  ".ggggggggggggggggggRRRgccccNN...",
  ".sgggggggggggggggggggggccccc....",
  "................................",
  "................................",
];

const SLEEP_B = edit(SLEEP_A, {
  8: "................................",
  9: "....................zz..........",
  10: ".....................z..........",
  11: "...................zz...........",
  18: "...ssgggggggggggggg.............",
  19: "..sggggggggggggggggggg..........",
});
const SLEEP_C = edit(SLEEP_A, {
  8: "...................zz...........",
  9: "....................z...........",
  10: "..................zz............",
});

const WALK = { fps: 8, frames: [WALK_A, WALK_B, WALK_C, WALK_B] };

export default {
  name: "dog",
  size: [32, 26],
  palette: PALETTE,
  // Root override: the baked-in collar pixels light up red + gold.
  rootPalette: { R: "#d9413d", T: "#f0c75e" },
  anims: {
    idle: { fps: 3, frames: [STAND, TAIL_MID, TAIL_LOW, TAIL_MID] },
    walk: WALK,
    walkFront: { fps: 7, frames: [stepA(FRONT), FRONT, stepB(FRONT), FRONT] },
    walkBack: { fps: 7, frames: [stepA(BACK), BACK, stepB(BACK), BACK] },
    dig: { fps: 10, frames: [DIG_A, DIG_B, DIG_D, DIG_C] },
    spin: { fps: 6, frames: [STAND, FRONT, mirror(STAND), BACK] },
    growl: { fps: 8, frames: [GROWL_A, GROWL_B, GROWL_A, GROWL_C] },
    fetch: { fps: 6, frames: [FETCH_A, FETCH_B, FETCH_C, FETCH_B] },
    sleep: { fps: 2, frames: [SLEEP_A, SLEEP_B, SLEEP_C] },
    look: { fps: 2, frames: [STAND, FRONT, mirror(STAND), FRONT] },
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
