// Terminator — dark-metal endoskeleton sprite sheet (GF-118).
//
// Front-facing humanoid in gunmetal armor with the iconic single red eye (the
// eye stays red regardless of session state — identity over indication; the
// state color rides on the leash/cards as usual).
//
// State motions: hammer(주먹 내리치기+스파크) / sweep(붉은 눈 스캔) /
// flare(눈 광폭+스파크) / thumbsup(엄지 들기) / shutdown(고개 숙임·소등) /
// scan(느린 스윕).

const PALETTE = {
  M: "#8f99a4", // armor
  D: "#4f5862", // dark armor / joints
  R: "#e8362e", // the red eye
  Y: "#f5d04c", // impact sparks
};

const STAND = [
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....MRRMM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Eye dimmed — the idle pulse pair.
const STAND_DIM = [
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....MDRMM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Heavy stomp: legs split wide, then gather with the frame dropped a pixel.
const STOMP_A = [
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....MRRMM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "...DD.....DD....",
  "...DD.....DD....",
  "..DDD.....DDD...",
];

const STOMP_B = [
  "................",
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....MRRMM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  ".....DD.DD......",
  ".....DD.DD......",
  "....DDD.DDD.....",
];

// Hammer: right fist raised overhead, then slammed down with sparks.
const HAMMER_UP = [
  "...........MM...",
  ".....MMMMM.MM...",
  ".....MMMMM.D....",
  ".....MRRMM.D....",
  ".....MMMMM.D....",
  "......DDD.D.....",
  "...MMMMMMMMM....",
  "..DMMMMMMMM.....",
  "..D.MMMMMMM.....",
  "..D.MMMMMMM.....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const HAMMER_DOWN = [
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....MRRMM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMD....",
  "..D.MMMMMMMD....",
  "..D.MMMMMMMMM...",
  "....DD...DD.MM..",
  "....DD...DD.Y...",
  "...DDD...DDDY.Y.",
];

// Sweep: the red eye tracks across the skull plate.
const SWEEP_L = [
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....RRMMM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const SWEEP_R = [
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....MMRRM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Flare: the eye blooms wide and sparks jump off the chassis.
const FLARE_A = [
  "..Y.............",
  ".....MMMMM......",
  ".....MMMMM..Y...",
  "....RRRRMM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const FLARE_B = [
  "............Y...",
  ".Y...MMMMM......",
  ".....MMMMM......",
  "....RRRRRM......",
  ".....MMMMM......",
  "......DDD.......",
  "...MMMMMMMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Thumbs-up: the arm rises with the thumb out — you know the scene.
const THUMB_A = [
  "...........DM...",
  ".....MMMMM..M...",
  ".....MMMMM..M...",
  ".....MRRMM..M...",
  ".....MMMMM..D...",
  "......DDD..D....",
  "...MMMMMMMMM....",
  "..DMMMMMMMM.....",
  "..D.MMMMMMM.....",
  "..D.MMMMMMM.....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const THUMB_B = [
  "................",
  ".....MMMMM..DM..",
  ".....MMMMM...M..",
  ".....MRRMM...M..",
  ".....MMMMM..D...",
  "......DDD..D....",
  "...MMMMMMMMM....",
  "..DMMMMMMMM.....",
  "..D.MMMMMMM.....",
  "..D.MMMMMMM.....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

// Shutdown: head bowed, eye off.
const SHUT_A = [
  "................",
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....MDDMM......",
  ".....MMMMM......",
  "...MMMDDDMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const SHUT_B = [
  "................",
  "................",
  ".....MMMMM......",
  ".....MMMMM......",
  ".....MDRMM......",
  ".....MMMMM......",
  "...MMMDDDMMM....",
  "..DMMMMMMMMMD...",
  "..D.MMMMMMM.D...",
  "..D.MMMMMMM.D...",
  "....DD...DD.....",
  "....DD...DD.....",
  "...DDD...DDD....",
];

const WALK = { fps: 4, frames: [STOMP_A, STOMP_B] };

export default {
  name: "terminator",
  size: [16, 13],
  palette: PALETTE,
  anims: {
    idle: { fps: 1.5, frames: [STAND, STAND_DIM] },
    walk: WALK,
    walkFront: WALK,
    walkBack: WALK,
    hammer: { fps: 6, frames: [HAMMER_UP, HAMMER_DOWN] },
    sweep: { fps: 3, frames: [SWEEP_L, STAND, SWEEP_R, STAND] },
    flare: { fps: 7, frames: [FLARE_A, FLARE_B] },
    thumbsup: { fps: 3, frames: [THUMB_A, THUMB_B] },
    shutdown: { fps: 1, frames: [SHUT_A, SHUT_B] },
    scan: { fps: 1.5, frames: [SWEEP_L, STAND, SWEEP_R, STAND] },
  },
  stateAnims: {
    working: "hammer",
    waiting: "sweep",
    error: "flare",
    done: "thumbsup",
    idle: "shutdown",
    pending: "scan",
  },
};
