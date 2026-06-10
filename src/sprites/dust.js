// Dust — amorphous dot-creature sprite sheet (GF-118).
//
// A shapeless pile of pixels with no face and no fixed silhouette: every pixel
// uses the @state sentinel, so the whole creature IS the state color (먼지는
// 색으로 상태를 표현한다). Working = green agitated swirl, error = red spiky
// jitter, done = blue sparkle burst, and so on.

const PALETTE = {
  a: "@state",
};

// Settled pile, gently boiling.
const SETTLE_A = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "......aa........",
  "....aaaaaa......",
  "...aaaaaaaa.....",
  "..aaaaaaaaaa....",
];

const SETTLE_B = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".........aa.....",
  ".....aaaaaa.....",
  "...aaaaaaaa.....",
  "..aaaaaaaaaa....",
];

// Rolling drift: the pile leans into its direction of travel, shedding motes.
const ROLL_A = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".......aaa......",
  ".....aaaaaa.....",
  "..a.aaaaaaaa....",
  "...aaaaaaaaaa...",
  ".a..aaaaaaaa....",
];

const ROLL_B = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "........aaa.....",
  "......aaaaaa....",
  "....aaaaaaaa.a..",
  "...aaaaaaaaaa...",
  "....aaaaaaaa..a.",
];

// Agitated work swirl: the dust whips itself into a busy column.
const SWIRL_A = [
  "................",
  "................",
  "......aa........",
  ".....aaaa..a....",
  "....aaaaaa......",
  ".a..aaaaaa......",
  "....aaaaaaa.....",
  "...aaaaaaaa..a..",
  "...aaaaaaaa.....",
  ".a.aaaaaaaaa....",
  "...aaaaaaaaa....",
  "..aaaaaaaaaaa...",
  "..aaaaaaaaaaa...",
];

const SWIRL_B = [
  "................",
  "................",
  ".......aa.......",
  "..a...aaaa......",
  "......aaaaaa....",
  "......aaaaaa..a.",
  ".....aaaaaaa....",
  "..a.aaaaaaaa....",
  ".....aaaaaaaa...",
  "....aaaaaaaaa.a.",
  "....aaaaaaaaa...",
  "...aaaaaaaaaaa..",
  "..aaaaaaaaaaa...",
];

const SWIRL_C = [
  "................",
  "................",
  "........aa......",
  ".....aaaa.......",
  "...a.aaaaaa.....",
  "......aaaaaa....",
  "....aaaaaaa..a..",
  "....aaaaaaaa....",
  "..a.aaaaaaaa....",
  "....aaaaaaaaa...",
  "...aaaaaaaaa....",
  "..aaaaaaaaaaa...",
  "...aaaaaaaaaaa..",
];

// Pulse: swells into a sphere, then settles back down.
const PULSE_BIG = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......aaaa......",
  "....aaaaaaaa....",
  "...aaaaaaaaaa...",
  "...aaaaaaaaaa...",
  "...aaaaaaaaaa...",
  "....aaaaaaaa....",
  ".....aaaaaa.....",
  "................",
];

// Spiky jitter: all edges, no calm.
const SPIKE_A = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "....a..a..a.....",
  ".....aaaaa......",
  "..a.aaaaaaa.a...",
  "....aaaaaaaa....",
  ".a.aaaaaaaaa.a..",
  "...aaaaaaaaa....",
  "..aaaaaaaaaaa...",
  ".a..a..a..a..a..",
];

const SPIKE_B = [
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....a..a..a....",
  "......aaaaa.....",
  "...a.aaaaaaa.a..",
  ".....aaaaaaaa...",
  "..a.aaaaaaaaa.a.",
  "....aaaaaaaaa...",
  "...aaaaaaaaaaa..",
  "..a..a..a..a..a.",
];

// Burst: motes shoot upward off a happy little mound.
const BURST_A = [
  "....a...........",
  "..........a.....",
  ".......a........",
  "....a......a....",
  "................",
  "......a.........",
  ".........a......",
  "....a...........",
  "...........a....",
  "......aa........",
  "....aaaaaa......",
  "...aaaaaaaa.....",
  "..aaaaaaaaaa....",
];

const BURST_B = [
  "..........a.....",
  "....a...........",
  "...........a....",
  ".......a........",
  "....a...........",
  "..........a.....",
  "....a...........",
  ".......a........",
  "....a......a....",
  ".........aa.....",
  ".....aaaaaa.....",
  "...aaaaaaaa.....",
  "..aaaaaaaaaa....",
];

// Drifting wisps: a stray tuft wanders off and rejoins.
const DRIFT_A = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..aa............",
  "................",
  "......aa........",
  "....aaaaaa......",
  "...aaaaaaaa.....",
  "..aaaaaaaaaa....",
];

const DRIFT_B = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "............aa..",
  "................",
  "................",
  "......aa........",
  "....aaaaaa......",
  "...aaaaaaaa.....",
  "..aaaaaaaaaa....",
];

const ROLL = { fps: 6, frames: [ROLL_A, ROLL_B] };

export default {
  name: "dust",
  size: [16, 13],
  palette: PALETTE,
  anims: {
    idle: { fps: 1.5, frames: [SETTLE_A, SETTLE_B] },
    walk: ROLL,
    walkFront: ROLL,
    walkBack: ROLL,
    swirl: { fps: 8, frames: [SWIRL_A, SWIRL_B, SWIRL_C] },
    pulse: { fps: 3, frames: [SETTLE_A, PULSE_BIG] },
    spike: { fps: 8, frames: [SPIKE_A, SPIKE_B] },
    burst: { fps: 4, frames: [BURST_A, BURST_B] },
    settle: { fps: 1, frames: [SETTLE_A, SETTLE_B] },
    drift: { fps: 2, frames: [DRIFT_A, DRIFT_B] },
  },
  stateAnims: {
    working: "swirl",
    waiting: "pulse",
    error: "spike",
    done: "burst",
    idle: "settle",
    pending: "drift",
  },
};
