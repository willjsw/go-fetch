// Robot — boxy pixel robot sprite sheet (GF-118).
//
// Front-facing (robots read best head-on; walking is a stompy shuffle, so the
// same frames serve side and vertical movement). Its LED eyes, antenna tip and
// chest lamp use the @state sentinel: the robot literally lights up in the
// session's state color.
//
// State motions: drill(진동+불꽃) / radar(안테나 스윕) / malfunction(연기+스파크)
// / thumbsup(팔 들어 올리기) / powersave(소등) / scan(눈동자 좌우).

const PALETTE = {
  M: "#b9c4cf", // hull
  D: "#76828e", // joints / treads / dark hull
  L: "@state", // LEDs — eyes, antenna, chest lamp
  Y: "#f5d04c", // work / malfunction sparks
  K: "#5b646e", // smoke
};

const STAND = [
  ".......L........",
  ".......D........",
  "....MMMMMMM.....",
  "....MLLMLLM.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Idle blink: antenna LED off, eyes dimmed to hull color.
const STAND_BLINK = [
  ".......D........",
  ".......D........",
  "....MMMMMMM.....",
  "....MDDMDDM.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// March: body dips one pixel, feet gather — a stompy toy-robot shuffle.
const MARCH = [
  "................",
  ".......L........",
  ".......D........",
  "....MMMMMMM.....",
  "....MLLMLLM.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  ".....DD.DD......",
  "....DDD.DDD.....",
];

// Drill: the whole frame vibrates one pixel left/right while sparks fly at the
// treads — a machine hard at work.
const DRILL_A = [
  ".......L........",
  ".......D........",
  "....MMMMMMM.....",
  "....MLLMLLM.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  ".Y..DD...DD.....",
  "..Y.DDD..DDD....",
];

const DRILL_B = [
  "........L.......",
  "........D.......",
  ".....MMMMMMM....",
  ".....MLLMLLM....",
  ".....MMMMMMM....",
  "......DDDDD.....",
  "....MMMMMMMMM...",
  "...DMMLLLMMMD...",
  "...DMMMMMMMMD...",
  "....MMMMMMMMM...",
  ".....DD...DD....",
  ".....DD...DD..Y.",
  "....DDD..DDD.Y..",
];

// Radar sweep: the antenna tip swings left → center → right.
const RADAR_L = [
  ".....L..........",
  "......D.........",
  "....MMMMMMM.....",
  "....MLLMLLM.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const RADAR_R = [
  ".........L......",
  "........D.......",
  "....MMMMMMM.....",
  "....MLLMLLM.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Malfunction: head tilts, eyes black out, smoke rises, sparks pop.
const MALF_A = [
  "...K...D........",
  "..K....D........",
  "...MMMMMMM..Y...",
  "...MDDMDDM.Y....",
  "...MMMMMMM......",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const MALF_B = [
  "....K..D....Y...",
  ".....K.D...Y....",
  ".....MMMMMMM....",
  ".....MDDMDDM....",
  ".....MMMMMMM....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Thumbs-up: right arm raised high, fist clenched, lamps bright.
const THUMB_A = [
  ".......L....MM..",
  ".......D....MD..",
  "....MMMMMMM.D...",
  "....MLLMLLM.D...",
  "....MMMMMMM.D...",
  ".....DDDDD.D....",
  "...MMMMMMMMM....",
  "..DMMLLLMMM.....",
  "..DMMMMMMMM.....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const THUMB_B = [
  ".......L........",
  ".......D....MM..",
  "....MMMMMMM.MD..",
  "....MLLMLLM.D...",
  "....MMMMMMM.D...",
  ".....DDDDD.D....",
  "...MMMMMMMMM....",
  "..DMMLLLMMM.....",
  "..DMMMMMMMM.....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Power-save: every lamp off, head sunk one pixel into the shoulders.
const SLEEP_A = [
  "................",
  ".......D........",
  "....MMMMMMM.....",
  "....MDDMDDM.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMDDDMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const SLEEP_B = [
  "................",
  "................",
  ".......D........",
  "....MMMMMMM.....",
  "....MDDMDDM.....",
  "....MMMMMMM.....",
  "...MMMDDDDDM....",
  "..DMMDDDMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Scan: eyes slide left / right across the visor while it figures things out.
const SCAN_L = [
  ".......L........",
  ".......D........",
  "....MMMMMMM.....",
  "....LLMMLLM.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const SCAN_R = [
  ".......L........",
  ".......D........",
  "....MMMMMMM.....",
  "....MLLMMLL.....",
  "....MMMMMMM.....",
  ".....DDDDD......",
  "...MMMMMMMMM....",
  "..DMMLLLMMMD....",
  "..DMMMMMMMMD....",
  "...MMMMMMMMM....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const WALK = { fps: 5, frames: [STAND, MARCH] };

export default {
  name: "robot",
  size: [16, 13],
  palette: PALETTE,
  anims: {
    idle: { fps: 1.5, frames: [STAND, STAND_BLINK] },
    walk: WALK,
    walkFront: WALK,
    walkBack: WALK,
    drill: { fps: 8, frames: [DRILL_A, DRILL_B] },
    radar: { fps: 3, frames: [RADAR_L, STAND, RADAR_R, STAND] },
    malfunction: { fps: 6, frames: [MALF_A, MALF_B] },
    thumbsup: { fps: 3, frames: [THUMB_A, THUMB_B] },
    powersave: { fps: 1, frames: [SLEEP_A, SLEEP_B] },
    scan: { fps: 2, frames: [SCAN_L, STAND, SCAN_R, STAND] },
  },
  stateAnims: {
    working: "drill",
    waiting: "radar",
    error: "malfunction",
    done: "thumbsup",
    idle: "powersave",
    pending: "scan",
  },
};
