// Terminator — Arnold on a motorcycle (GF-118; 32×26 detail pass).
//
// Side view facing right: slick hair, sunglasses, leather jacket, one hand on
// the bar of a low cruiser — and a pump shotgun for when there is WORK to do.
// He never walks; he rides, so the move anims are the bike rolling.
//
// State motions: shotgun(한손 샷건 — 조준→발사→연기→펌프, 4f) / scan(고개
// 좌우, 4f) / backfire(역화 스파크+빨간 글린트, 3f) / thumbsup(엄지 — 그 장면,
// 3f) / park(시동 끄고 꾸벅, 3f) / scanSlow(pending).

const PALETTE = {
  H: "#3a322c", // hair
  F: "#d9a47e", // skin
  J: "#2b2e35", // leather jacket
  N: "#14181c", // sunglasses / tires / shotgun / boots
  M: "#8f99a4", // tank / engine / hubs / headlight
  D: "#4f5862", // fork / exhaust / bar / stock
  R: "#e8362e", // taillight / angry lens glint
  Y: "#f5d04c", // muzzle flash / backfire sparks
  K: "#5b646e", // smoke
  z: "#9ca3af", // parked-doze Zz
};

const E = "................................";
const edit = (g, edits) => g.map((row, y) => edits[y] ?? row);
const shiftRight = (g) => g.map((row) => "." + row.slice(0, 31));

// Arnold + bike at rest, hand on the bar.
const BASE = [
  "................................",
  "...........HHHH.................",
  "...........HHHHH................",
  "...........FFFFH................",
  "...........NNNNN................",
  "...........FFFF.................",
  "............FF..................",
  "...........JJJJ.................",
  "..........JJJJJJ................",
  "..........JJJJJ.JJ..............",
  "..........JJJJJ...JJ............",
  "..........JJJJJ.....FF..........",
  "........NNJJJJJJ.....DD.........",
  "...R....MMMMJJJJJJ...DD.........",
  ".....MMMMMMMMM..JJ...DD..MM.....",
  "..DDDDDDMMMMMMMM.JJ..DD.MM......",
  "..DDDDDD.MMMMMM..JJ..DD.........",
  ".....NNNN.......NNNN..NNNN......",
  "....NNNNNN...........NNNNNN.....",
  "...NNNNNNNN.........NNNNNNNN....",
  "...NNNMMNNN.........NNNMMNNN....",
  "...NNNNNNNN.........NNNNNNNN....",
  "....NNNNNN...........NNNNNN.....",
  ".....NNNN.............NNNN......",
  "................................",
  "................................",
];

// Rolling: the hubs swing and the pipe breathes a puff.
const RIDE_B = edit(BASE, {
  15: "K.DDDDDDMMMMMMMM.JJ..DD.MM......",
  19: "...NNNNMNNN.........NNNNMNNN....",
  20: "...NNNM.NNN.........NNNM.NNN....",
  21: "...NNNNMNNN.........NNNNMNNN....",
});
const RIDE_C = edit(BASE, {
  8: "..........JJJJJJJ...............",
  15: ".KDDDDDDMMMMMMMM.JJ..DD.MM......",
  20: "...NNMM.NNN.........NNMM.NNN....",
});

// Working: the shotgun comes up — aim, FIRE (muzzle flash), smoke, pump.
const GUN_AIM = edit(BASE, {
  8: "..........JJJJJJ.NNNNNNNN.......",
  9: "..........JJJJJ.DDFF............",
  10: "..........JJJJJ.................",
  11: "..........JJJJJ.................",
});
const GUN_FIRE = edit(BASE, {
  7: "...........JJJJ..........Y.Y....",
  8: "..........JJJJJJ.NNNNNNNNYYY....",
  9: "..........JJJJJ.DDFF.....Y.Y....",
  10: "..........JJJJJ.................",
  11: "..........JJJJJ.................",
});
const GUN_SMOKE = edit(BASE, {
  6: "............FF...........K......",
  7: "...........JJJJ.........KK......",
  8: "..........JJJJJJ.NNNNNNNN.......",
  9: "..........JJJJJ.DDFF............",
  10: "..........JJJJJ.................",
  11: "..........JJJJJ.................",
});
const GUN_PUMP = edit(BASE, {
  8: "..........JJJJJJ................",
  9: "..........JJJJJ.DDNNNNNNNN......",
  10: "..........JJJJJ...FF............",
  11: "..........JJJJJ.................",
});

// Scan: the head turns back, then forward.
const SCAN_L = edit(BASE, {
  1: "..........HHHH..................",
  2: "..........HHHHH.................",
  3: "..........HFFFF.................",
  4: "..........NNNNN.................",
  5: "..........FFFF..................",
});
const SCAN_R = edit(BASE, {
  1: "............HHHH................",
  2: "............HHHHH...............",
  3: "............FFFFH...............",
  4: "............NNNNN...............",
  5: "............FFFF................",
});

// Backfire: sparks and smoke burst off the pipe, lenses glint red, the bike
// jolts a pixel.
const FIRE_A = edit(BASE, {
  4: "...........NRNRN................",
  14: ".Y...MMMMMMMMM..JJ...DD..MM.....",
  15: "Y.DDDDDDMMMMMMMM.JJ..DD.MM......",
  16: ".YDDDDDD.MMMMMM..JJ..DD.........",
});
const FIRE_B = edit(shiftRight(BASE), {
  4: "............NRNRN...............",
  15: ".K.DDDDDDMMMMMMMM.JJ..DD.MM.....",
  16: "Y..DDDDDD.MMMMMM..JJ..DD........",
});
const FIRE_C = edit(BASE, {
  4: "...........NRNRN................",
  13: ".KKR....MMMMJJJJJJ...DD.........",
  15: ".YDDDDDDMMMMMMMM.JJ..DD.MM......",
});

// Thumbs-up from the saddle — pumping once. You know the scene.
const THUMB_A = edit(BASE, {
  3: "...........FFFFH.F..............",
  4: "...........NNNNN.FF.............",
  5: "...........FFFF...JJ............",
  6: "............FF....JJ............",
  7: "...........JJJJ...JJ............",
  8: "..........JJJJJJJJJ.............",
  9: "..........JJJJJ.................",
  10: "..........JJJJJ.................",
  11: "..........JJJJJ.................",
});
const THUMB_B = edit(BASE, {
  2: "...........HHHHH.F..............",
  3: "...........FFFFH.FF.............",
  4: "...........NNNNN..JJ............",
  5: "...........FFFF...JJ............",
  6: "............FF....JJ............",
  7: "...........JJJJ...JJ............",
  8: "..........JJJJJJJJJ.............",
  9: "..........JJJJJ.................",
  10: "..........JJJJJ.................",
  11: "..........JJJJJ.................",
});

// Parked: head bowed, engine off, Zz drifting.
const PARK_A = edit(BASE, {
  0: "....................z...........",
  1: "...........HHHH....zz...........",
  2: "...........HHHHH................",
});
const PARK_B = edit(BASE, {
  0: ".....................zz.........",
  1: "...........HHHH.....z...........",
  2: "...........HHHHH................",
});
const PARK_C = edit(BASE, {
  1: "...........HHHH.................",
  2: "...........HHHHH....z...........",
  3: "...........FFFFH...zz...........",
});

const RIDE = { fps: 8, frames: [BASE, RIDE_B, BASE, RIDE_C] };

export default {
  name: "terminator",
  size: [32, 26],
  palette: PALETTE,
  anims: {
    idle: { fps: 2, frames: [BASE, RIDE_B] },
    walk: RIDE,
    walkFront: RIDE,
    walkBack: RIDE,
    shotgun: { fps: 8, frames: [GUN_AIM, GUN_FIRE, GUN_SMOKE, GUN_PUMP] },
    scan: { fps: 3, frames: [SCAN_L, BASE, SCAN_R, BASE] },
    backfire: { fps: 8, frames: [FIRE_A, FIRE_B, FIRE_C] },
    thumbsup: { fps: 3, frames: [THUMB_A, THUMB_B, THUMB_A] },
    park: { fps: 1.5, frames: [PARK_A, PARK_B, PARK_C] },
    scanSlow: { fps: 1.5, frames: [SCAN_L, BASE, SCAN_R, BASE] },
  },
  stateAnims: {
    working: "shotgun",
    waiting: "scan",
    error: "backfire",
    done: "thumbsup",
    idle: "park",
    pending: "scanSlow",
  },
};
