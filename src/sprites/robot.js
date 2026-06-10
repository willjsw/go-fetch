// Robot — boxy pixel robot sprite sheet (GF-118; 32×26 detail pass).
//
// Front-facing: antenna, 2×2 LED eyes in a visor, jointed arms, chest lamp
// strip. Eyes / antenna / chest / saucer lights use the @state sentinel.
//
// WORKING is special: the robot folds into a FLYING SAUCER and zips around the
// floor — `moveAnims.working` keeps the UFO frames while strolling and the
// `behavior.working` override makes it fly farther and faster than anyone
// walks (비행접시로 변신해서 날아다님).
//
// Other motions: radar(안테나 스윕, 4f) / malfunction(연기+스파크, 3f) /
// thumbsup(팔 들기, 3f) / powersave(소등 슬럼프, 3f) / scan(눈동자 좌우, 4f).

const PALETTE = {
  M: "#b9c4cf", // hull
  D: "#76828e", // joints / legs / disc rim
  L: "@state", // LEDs — eyes, antenna, chest, saucer lights
  Y: "#f5d04c", // sparks / thrusters
  K: "#5b646e", // smoke
};

const E = "................................";
const edit = (g, edits) => g.map((row, y) => edits[y] ?? row);
const shiftDown = (g, n) => Array(n).fill(E).concat(g.slice(0, g.length - n));
const shiftRight = (g) => g.map((row) => "." + row.slice(0, 31));

const STAND = [
  "...............L................",
  "...............D................",
  "..........MMMMMMMMMMMM..........",
  "..........MMMMMMMMMMMM..........",
  "..........MMLLMMMMLLMM..........",
  "..........MMLLMMMMLLMM..........",
  "..........MMMMMMMMMMMM..........",
  ".............DDDDDD.............",
  "........MMMMMMMMMMMMMMMM........",
  "......DDMMMMMMMMMMMMMMMMDD......",
  "......DD.MMMLLLLLLMMM.DD........",
  "......DD.MMMLLLLLLMMM.DD........",
  "......DD.MMMMMMMMMMMM.DD........",
  "......DD.MMMMMMMMMMMM.DD........",
  "......MM.MMMMMMMMMMMM.MM........",
  ".........MMMMMMMMMMMM...........",
  ".........MMMMMMMMMMMM...........",
  "...........DD....DD.............",
  "...........DD....DD.............",
  "...........DD....DD.............",
  "...........DD....DD.............",
  "...........DD....DD.............",
  "..........DDD....DDD............",
  "................................",
  "................................",
  "................................",
];

// Idle blink: antenna and eyes go dark for a beat, chest dims.
const STAND_BLINK = edit(STAND, {
  0: "...............D................",
  4: "..........MMDDMMMMDDMM..........",
  5: "..........MMDDMMMMDDMM..........",
});
const STAND_HALF = edit(STAND, {
  4: "..........MMLLMMMMDDMM..........",
  5: "..........MMLLMMMMDDMM..........",
});

// March: legs split, gather (chassis dips), opposite split — a 4-step stomp.
const MARCH_A = edit(STAND, {
  17: ".........DD........DD...........",
  18: ".........DD........DD...........",
  19: ".........DD........DD...........",
  20: ".........DD........DD...........",
  21: ".........DD........DD...........",
  22: "........DDD........DDD..........",
});
const MARCH_B = edit(shiftDown(STAND, 1), {
  18: ".............DD.DD..............",
  19: ".............DD.DD..............",
  20: ".............DD.DD..............",
  21: ".............DD.DD..............",
  22: ".............DD.DD..............",
  23: "............DDD.DDD.............",
});

// WORKING — the flying saucer. Dome keeps the LED eyes; the disc rim lights
// chase each other and the thrusters flicker underneath.
const UFO_A = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  ".............MMMMMM.............",
  "............MMLLLLMM............",
  "............MMMMMMMM............",
  "......DDDDDDDDDDDDDDDDDDDD......",
  "....MMLMMLMMLMMLMMLMMLMMLMMM....",
  "....DDDDDDDDDDDDDDDDDDDDDDDD....",
  ".......DDDDDDDDDDDDDDDDDD.......",
  "............YY....YY............",
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

const UFO_B = edit(shiftDown(UFO_A, 1), {
  13: "....MLMMLMMLMMLMMLMMLMMLMMMM....",
  16: "..........YY........YY..........",
});
const UFO_C = edit(UFO_A, {
  12: "....MMMLMMLMMLMMLMMLMMLMMLMM....",
  15: "..............YYYY..............",
});

// Radar sweep: the antenna tip swings across the head.
const RADAR_L = edit(STAND, {
  0: "............L...................",
  1: ".............D..................",
});
const RADAR_R = edit(STAND, {
  0: "..................L.............",
  1: ".................D..............",
});

// Malfunction: head tilts, eyes black out, smoke rises, sparks pop.
const MALF_A = edit(STAND, {
  0: ".....K.........D................",
  1: "....K..........D................",
  2: ".........MMMMMMMMMMMM...Y.......",
  3: ".........MMMMMMMMMMMM..Y........",
  4: ".........MMDDMMMMDDMM...........",
  5: ".........MMDDMMMMDDMM...........",
  6: ".........MMMMMMMMMMMM...........",
});
const MALF_B = edit(STAND, {
  0: "......K........D......Y.........",
  1: ".....K.........D.....Y..........",
  4: "..........MMDDMMMMDDMM..........",
  5: "..........MMDDMMMMDDMM..........",
});
const MALF_C = edit(shiftRight(STAND), {
  0: "....K...........D...............",
  1: "...K..Y.........D...............",
  5: "...........MMDDMMMMDDMM.........",
});

// Thumbs-up: right arm raised high, lamps bright — pumping once.
const THUMB_A = edit(STAND, {
  2: "..........MMMMMMMMMMMM....MM....",
  3: "..........MMMMMMMMMMMM....MD....",
  4: "..........MMLLMMMMLLMM....D.....",
  5: "..........MMLLMMMMLLMM....D.....",
  6: "..........MMMMMMMMMMMM....D.....",
  7: ".............DDDDDD.......D.....",
  8: "........MMMMMMMMMMMMMMMMMMD.....",
  9: "......DDMMMMMMMMMMMMMMMM........",
  14: "......MM.MMMMMMMMMMMM...........",
});
const THUMB_B = edit(STAND, {
  1: "...............D..........MM....",
  2: "..........MMMMMMMMMMMM....MD....",
  3: "..........MMMMMMMMMMMM....D.....",
  4: "..........MMLLMMMMLLMM....D.....",
  5: "..........MMLLMMMMLLMM....D.....",
  6: "..........MMMMMMMMMMMM....D.....",
  7: ".............DDDDDD......D......",
  8: "........MMMMMMMMMMMMMMMMMD......",
  9: "......DDMMMMMMMMMMMMMMMM........",
  14: "......MM.MMMMMMMMMMMM...........",
});

// Power-save: lamps off, head sunk into the shoulders, sinking lower.
const SLEEP_A = edit(STAND, {
  0: "...............D................",
  4: "..........MMDDMMMMDDMM..........",
  5: "..........MMDDMMMMDDMM..........",
  10: "......DD.MMMDDDDDDMMM.DD........",
  11: "......DD.MMMDDDDDDMMM.DD........",
});
const SLEEP_B = shiftDown(SLEEP_A, 1);
const SLEEP_C = shiftDown(SLEEP_A, 2);

// Scan: the eye blocks slide across the visor.
const SCAN_L = edit(STAND, {
  4: "..........LLMMMMMMLLMM..........",
  5: "..........LLMMMMMMLLMM..........",
});
const SCAN_R = edit(STAND, {
  4: "..........MMLLMMMMMMLL..........",
  5: "..........MMLLMMMMMMLL..........",
});

const WALK = { fps: 6, frames: [MARCH_A, STAND, MARCH_B, STAND] };

export default {
  name: "robot",
  size: [32, 26],
  palette: PALETTE,
  anims: {
    idle: { fps: 2, frames: [STAND, STAND_HALF, STAND_BLINK] },
    walk: WALK,
    walkFront: WALK,
    walkBack: WALK,
    ufo: { fps: 9, frames: [UFO_A, UFO_B, UFO_C] },
    radar: { fps: 3, frames: [RADAR_L, STAND, RADAR_R, STAND] },
    malfunction: { fps: 8, frames: [MALF_A, MALF_B, MALF_C] },
    thumbsup: { fps: 3, frames: [THUMB_A, THUMB_B, THUMB_A] },
    powersave: { fps: 1.5, frames: [SLEEP_A, SLEEP_B, SLEEP_C, SLEEP_B] },
    scan: { fps: 2, frames: [SCAN_L, STAND, SCAN_R, STAND] },
  },
  // While WORKING the robot IS the saucer — even when moving (it flies).
  moveAnims: { working: "ufo" },
  // …and it flies farther, faster, with barely a hover-pause between hops.
  behavior: { working: { hop: 0.3, speed: 0.22, act: 1.2, actVar: 0.8, roam: true } },
  stateAnims: {
    working: "ufo",
    waiting: "radar",
    error: "malfunction",
    done: "thumbsup",
    idle: "powersave",
    pending: "scan",
  },
};
