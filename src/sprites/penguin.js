// Penguin — pixel penguin sprite sheet (GF-118; 32×26 detail pass).
//
// Front-facing; walking is the classic lean waddle (4f). While WORKING it
// pecks the ice AND beats its wings rapidly (작업 시 빠른 파닥임, 3f) so a
// busy penguin is unmistakable.
//
// Other motions: spin(옆→정면→옆→뒤) / flap(성난 날갯짓, 3f) / fish(물고기
// 물고 옴, 3f) / tuck(고개 묻고 잠, 3f) / look(두리번, 4f).

const PALETTE = {
  K: "#2c3440", // body
  W: "#f4f6f8", // belly
  O: "#f2a23c", // beak / feet
  N: "#10141a", // eyes
  I: "#b8dcea", // ice chips
  F: "#9fb6c4", // caught fish
};

const E = "................................";
const mirror = (grid) => grid.map((row) => [...row].reverse().join(""));
const edit = (g, edits) => g.map((row, y) => edits[y] ?? row);
const shiftDown = (g, n) => Array(n).fill(E).concat(g.slice(0, g.length - n));

const STAND = [
  "................................",
  "............KKKKKKKK............",
  "...........KKKKKKKKKK...........",
  "..........KKKKKKKKKKKK..........",
  "..........KKWNKKKKNWKK..........",
  "..........KKWNKKKKNWKK..........",
  "..........KKKKKOOKKKKK..........",
  "..........KKKKKOOKKKKK..........",
  ".........KKKWWWWWWWWKKK.........",
  "........KKKWWWWWWWWWWKKK........",
  ".......KKKWWWWWWWWWWWWKKK.......",
  "......KKKWWWWWWWWWWWWWWKKK......",
  "......KKKWWWWWWWWWWWWWWKKK......",
  "......KKKWWWWWWWWWWWWWWKKK......",
  "......KKKWWWWWWWWWWWWWWKKK......",
  "......KKKWWWWWWWWWWWWWWKKK......",
  "......KKKWWWWWWWWWWWWWWKKK......",
  ".......KKKWWWWWWWWWWWWKKK.......",
  "........KKKWWWWWWWWWWKKK........",
  ".........KKKWWWWWWWWKKK.........",
  "..........KKKKKKKKKKKK..........",
  "................................",
  "..........OOO......OOO..........",
  "................................",
  "................................",
  "................................",
];

// Waddle: the bird leans, opposite foot stepping out (mirrored for the pair).
const WADDLE = edit(
  STAND.map((row) => row.slice(1) + "."),
  {
    22: "........OOO..........OOO........",
  },
);

// Side profile (facing right) — for the waiting spin.
const SIDE = [
  "................................",
  "..............KKKKKKK...........",
  ".............KKKKKKKKK..........",
  "............KKKKKKKKKKK.........",
  "............KKKKNKKKKKK.........",
  "............KKKKKKKKKKOOO.......",
  "............KKKKKKKKKKOO........",
  "...........KKKKKKKKWWKK.........",
  "...........KKKKKKWWWWWK.........",
  "..........KKKKKKWWWWWWK.........",
  "..........KKKKKKWWWWWWK.........",
  "..........KKKKKKWWWWWWK.........",
  "..........KKKKKKWWWWWWK.........",
  "..........KKKKKKWWWWWWK.........",
  "..........KKKKKKWWWWWK..........",
  "...........KKKKKWWWWWK..........",
  "...........KKKKKWWWWK...........",
  "............KKKKKKKKK...........",
  ".............KKKKKKKK...........",
  "................................",
  "............OOO..OOO............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

// Back: all black, no face.
const BACK = edit(STAND, {
  4: "..........KKKKKKKKKKKK..........",
  5: "..........KKKKKKKKKKKK..........",
  6: "..........KKKKKKKKKKKK..........",
  7: "..........KKKKKKKKKKKK..........",
  8: ".........KKKKKKKKKKKKKK.........",
  9: "........KKKKKKKKKKKKKKKK........",
  10: ".......KKKKKKKKKKKKKKKKKK.......",
  11: "......KKKKKKKKKKKKKKKKKKKK......",
  12: "......KKKKKKKKKKKKKKKKKKKK......",
  13: "......KKKKKKKKKKKKKKKKKKKK......",
  14: "......KKKKKKKKKKKKKKKKKKKK......",
  15: "......KKKKKKKKKKKKKKKKKKKK......",
  16: "......KKKKKKKKKKKKKKKKKKKK......",
  17: ".......KKKKKKKKKKKKKKKKKK.......",
  18: "........KKKKKKKKKKKKKKKK........",
  19: ".........KKKKKKKKKKKKKK.........",
});

// WORKING — pecking the ice while the wings beat: up / level / down with the
// head driving lower each step, ice chips spraying at the bottom.
const PECK_WINGS_UP = edit(STAND, {
  8: "KK.......KKKWWWWWWWWKKK......KK.",
  9: ".KK.....KKKWWWWWWWWWWKKK....KK..",
  10: "..KKK..KKKWWWWWWWWWWWWKKK.KKK...",
  11: "....KKKKKWWWWWWWWWWWWWWKKKK.....",
});
const PECK_MID = edit(shiftDown(STAND, 1), {
  9: "KKK......KKKWWWWWWWWKKK.....KKK.",
  10: "..KKKKK.KKKWWWWWWWWWWKKK.KKKK...",
  22: ".I..............................",
  23: "..........OOO......OOO..........",
});
const PECK_DOWN = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "..........KKKKKKKK..............",
  ".........KKKKKKKKKK.............",
  "........KKKKKKKKKKKK............",
  "........KKWNKKKKNWKK............",
  "KK......KKWNKKKKNWKK......KK....",
  ".KKK....KKKKKKKKKKKK....KKK.....",
  "...KKKKKKKWWWWWWWWKKKKKKK.......",
  "......KKKWWWWWWWWWWKKK..........",
  "......KKKWWWWWWWWWWWWKKK........",
  "......KKKWWWWWWWWWWWWKKK........",
  "......KKKWWWWWWWWWWWWKKK........",
  ".......KKKWWWWWWWWWWKKK.........",
  "........KKKWWWWWWWWKKK..........",
  ".........KKKKKOOKKKKK...........",
  "..............OO................",
  "..I..........OO.....I...........",
  ".I.I.......................I....",
  "..........OOO......OOO..........",
  "................................",
  "................................",
  "................................",
];

// Angry flap: wings thrown out wide, beak open, hopping mad (3f).
const FLAP_UP = edit(STAND, {
  6: "..........KKKKOOOKKKKK..........",
  7: "..........KKKKKOOKKKKK..........",
  8: "KK.......KKKWWWWWWWWKKK......KK.",
  9: ".KKK....KKKWWWWWWWWWWKKK...KKK..",
  10: "...KKKKKKKWWWWWWWWWWWWKKKKKK....",
});
const FLAP_MID = edit(STAND, {
  6: "..........KKKKOOOKKKKK..........",
  7: "..........KKKKKOOKKKKK..........",
  10: "KKKKKKKKKKWWWWWWWWWWWWKKKKKKKKK.",
});
const FLAP_DOWN = edit(STAND, {
  6: "..........KKKKOOOKKKKK..........",
  7: "..........KKKKKOOKKKKK..........",
  13: "....KKKKKWWWWWWWWWWWWWWKKKK.....",
  14: "..KKKKKKKWWWWWWWWWWWWWWKKKKKK...",
  15: "KKK...KKKWWWWWWWWWWWWWWKKK..KKK.",
});

// Fresh catch: a fish held crossways in the beak, tail flapping (3f).
const FISH_A = edit(STAND, {
  6: "......FFFFKKKKKOOKKKKK..........",
  7: ".......F..KKKKKOOKKKKK..........",
});
const FISH_B = edit(STAND, {
  5: ".......F..KKWNKKKKNWKK..........",
  6: "......FFFFKKKKKOOKKKKK..........",
});
const FISH_C = edit(STAND, {
  6: "......FFFFKKKKKOOKKKKK..........",
  7: "......F...KKKKKOOKKKKK..........",
});

// Tucked sleep: head sunk into the shoulders — a black-and-white egg (3f).
const TUCK_A = edit(shiftDown(STAND, 3), {
  4: "..........KKKKKKKKKKKK..........",
  5: "..........KKKKKKKKKKKK..........",
  6: "..........KKKKKKKKKKKK..........",
  7: "..........KKKKKKKKKKKK..........",
  22: "..........OOO......OOO..........",
  23: "................................",
  24: "................................",
  25: "................................",
});
const TUCK_B = shiftDown(TUCK_A, 1);

// Look around: the eyes dart to one side.
const LOOK_L = edit(STAND, {
  4: "..........NWKKKKKKNWKK..........",
  5: "..........NWKKKKKKNWKK..........",
});

const WALK = { fps: 7, frames: [WADDLE, STAND, mirror(WADDLE), STAND] };

export default {
  name: "penguin",
  size: [32, 26],
  palette: PALETTE,
  anims: {
    idle: { fps: 1.5, frames: [STAND, TUCK_A] },
    walk: WALK,
    walkFront: WALK,
    walkBack: WALK,
    peck: { fps: 9, frames: [PECK_WINGS_UP, PECK_MID, PECK_DOWN] },
    spin: { fps: 6, frames: [SIDE, STAND, mirror(SIDE), BACK] },
    flap: { fps: 9, frames: [FLAP_UP, FLAP_MID, FLAP_DOWN, FLAP_MID] },
    fish: { fps: 4, frames: [FISH_A, FISH_B, FISH_C, FISH_B] },
    tuck: { fps: 1, frames: [TUCK_A, TUCK_B, TUCK_A] },
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
