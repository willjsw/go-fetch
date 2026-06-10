// Penguin — pixel penguin sprite sheet (GF-118).
//
// Front-facing; walking is the classic lean-left/lean-right waddle, so the same
// frames serve every direction. Black body, white belly, orange beak/feet.
//
// State motions: peck(얼음 쪼기+얼음 조각) / spin(옆→정면→옆→뒤) / flap(성난
// 날갯짓) / fish(물고기 물고 옴) / tuck(고개 묻고 잠) / look(두리번).

const PALETTE = {
  K: "#2c3440", // body
  W: "#f4f6f8", // belly
  O: "#f2a23c", // beak / feet
  N: "#10141a", // eyes
  I: "#b8dcea", // ice chips
  F: "#9fb6c4", // caught fish
};

/** Horizontal mirror for the spin turn-around. */
const mirror = (grid) => grid.map((row) => [...row].reverse().join(""));

const STAND = [
  "................",
  ".....KKKKK......",
  "....KKKKKKK.....",
  "....KNKKKNK.....",
  "....KKKOKKK.....",
  "...KKWWWWWKK....",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "...KKWWWWWKK....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

// Waddle: the whole bird leans left, right foot steps out — then mirrored.
const WADDLE_L = [
  "................",
  "....KKKKK.......",
  "...KKKKKKK......",
  "...KNKKKNK......",
  "...KKKOKKK......",
  "..KKWWWWWKK.....",
  ".KKWWWWWWWKK....",
  ".KKWWWWWWWKK....",
  ".KKWWWWWWWKK....",
  "..KKWWWWWKK.....",
  "...KKKKKKK......",
  "................",
  "...OO.....OO....",
];

// Side profile (facing right) — for the waiting spin.
const SIDE = [
  "................",
  "......KKKK......",
  ".....KKKKKK.....",
  ".....KKNKKK.....",
  ".....KKKKOO.....",
  "....KKKKWWK.....",
  "...KKKKWWWK.....",
  "...KKKKWWWK.....",
  "...KKKKWWWK.....",
  "....KKKWWK......",
  ".....KKKKK......",
  "................",
  ".....OO.OO......",
];

// Back: all black, no face.
const BACK = [
  "................",
  ".....KKKKK......",
  "....KKKKKKK.....",
  "....KKKKKKK.....",
  "....KKKKKKK.....",
  "...KKKKKKKKK....",
  "..KKKKKKKKKKK...",
  "..KKKKKKKKKKK...",
  "..KKKKKKKKKKK...",
  "...KKKKKKKKK....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

// Peck: head drives down into the ice, chips spray, then rears back up.
const PECK_DOWN = [
  "................",
  "................",
  "................",
  "...KKKKK........",
  "..KKKKKKK.......",
  "..KNKKKNKWKK....",
  "..KKKOKWWWWKK...",
  "...KKOWWWWWKK...",
  "....KWWWWWWKK...",
  "....KKWWWWKK....",
  ".....KKKKKK.....",
  "..I.I...........",
  ".I..OO...OO.....",
];

const PECK_UP = [
  "....KKKKK.......",
  "...KKKKKKK......",
  "...KNKKKNK......",
  "...KKKOKKK......",
  "...KKWWWWWKK....",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "...KKWWWWWKK....",
  "....KKKKKKK.....",
  "................",
  "................",
  "....OO...OO.....",
];

// Angry flap: wings thrown out wide, beak open, hopping mad.
const FLAP_UP = [
  "................",
  ".....KKKKK......",
  "....KKKKKKK.....",
  "....KNKKKNK.....",
  "....KKOOKKK.....",
  "K..KKWWWWWKK..K.",
  ".KKKWWWWWWWKKK..",
  "...KWWWWWWWK....",
  "...KWWWWWWWK....",
  "....KWWWWWK.....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

const FLAP_DOWN = [
  "................",
  "................",
  ".....KKKKK......",
  "....KKKKKKK.....",
  "....KNKKKNK.....",
  "....KKOOKKK.....",
  "...KKWWWWWKK....",
  ".KKKWWWWWWWKKK..",
  "K..KWWWWWWWK..K.",
  "....KWWWWWK.....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

// Fresh catch: a fish held crossways in the beak, tail flapping.
const FISH_A = [
  "................",
  ".....KKKKK......",
  "....KKKKKKK.....",
  "....KNKKKNK.....",
  "..FFFKKOKKK.....",
  "...KKWWWWWKK....",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "...KKWWWWWKK....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

const FISH_B = [
  "................",
  ".....KKKKK......",
  "....KKKKKKK.....",
  "....KNKKKNK.....",
  "...FFKKOKKK.....",
  "..F.KKWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "...KKWWWWWKK....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

// Tucked sleep: head sunk, eyes shut — a black-and-white egg.
const TUCK_A = [
  "................",
  "................",
  "................",
  "....KKKKKKK.....",
  "...KKKKKKKKK....",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "...KKWWWWWKK....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

const TUCK_B = [
  "................",
  "................",
  "................",
  "................",
  "....KKKKKKK.....",
  "...KKWWWWWKK....",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "...KKWWWWWKK....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

// Look around: eyes dart to one side, then the other.
const LOOK_L = [
  "................",
  ".....KKKKK......",
  "....KKKKKKK.....",
  "....NKKKNKK.....",
  "....KKKOKKK.....",
  "...KKWWWWWKK....",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "..KKWWWWWWWKK...",
  "...KKWWWWWKK....",
  "....KKKKKKK.....",
  "................",
  "....OO...OO.....",
];

const WALK = { fps: 5, frames: [WADDLE_L, mirror(WADDLE_L)] };

export default {
  name: "penguin",
  size: [16, 13],
  palette: PALETTE,
  anims: {
    idle: { fps: 1.5, frames: [STAND, TUCK_A] },
    walk: WALK,
    walkFront: WALK,
    walkBack: WALK,
    peck: { fps: 7, frames: [PECK_UP, PECK_DOWN] },
    spin: { fps: 5, frames: [SIDE, STAND, mirror(SIDE), BACK] },
    flap: { fps: 8, frames: [FLAP_UP, FLAP_DOWN] },
    fish: { fps: 3, frames: [FISH_A, FISH_B] },
    tuck: { fps: 1, frames: [TUCK_A, TUCK_B] },
    look: { fps: 2, frames: [LOOK_L, STAND, mirror(LOOK_L), STAND] },
  },
  stateAnims: {
    working: "peck",
    waiting: "spin",
    error: "flap",
    done: "fish",
    idle: "tuck",
    pending: "look",
  },
};
