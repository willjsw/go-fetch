// Jensen — leather-jacket tech-CEO caricature sprite sheet (GF-118).
//
// Front-facing figure: swept gray hair, glasses, the trademark black leather
// jacket, and a glowing green GPU he is extremely proud of.
//
// State motions: tinker(GPU 만지작+초록 스파클) / crossed(팔짱+발 구르기) /
// facepalm(이마 짚기) / present(GPU 번쩍 들기) / doze(선 채로 꾸벅) /
// glance(좌우 살피기).

const PALETTE = {
  J: "#2b2e35", // leather jacket
  H: "#cfd2d6", // hair
  F: "#e6b48e", // skin
  N: "#1c1f24", // glasses / shoes / details
  G: "#76b900", // the GPU (and its glow)
  D: "#565b63", // pants
};

const STAND = [
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  ".....FFFFF......",
  "....JJJJJJJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJ.JJ....",
  "...FF.JJJ.FF....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

// Idle nod: the head dips a pixel.
const STAND_NOD = [
  "................",
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  "....JFFFFFJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJ.JJ....",
  "...FF.JJJ.FF....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

// Stride: legs scissor, arms swing.
const STRIDE_A = [
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  ".....FFFFF......",
  "....JJJJJJJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJ.JJ....",
  "...FF.JJJ.FF....",
  "...DD.....DD....",
  "...DD.....DD....",
  "..NNN.....NNN...",
];

const STRIDE_B = [
  "................",
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  "....JJJJJJJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJ.JJ....",
  "...FF.JJJ.FF....",
  ".....DD.DD......",
  ".....DD.DD......",
  "....NNN.NNN.....",
];

// Tinker: hunched over the GPU held at the waist, green sparks of progress.
const TINKER_A = [
  "................",
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  "....JFFFFFJ.....",
  "...JJJJJJJJJ....",
  "...JJ.GGG.JJ....",
  "...FFGGGGGFF....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

const TINKER_B = [
  "..........G.....",
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  "....JFFFFFJ.....",
  "...JJJJJJJJJ....",
  "...JJ.GGG.JJ....",
  "...FFGGGGGFF....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

// Arms crossed, toe tapping — waiting for the build (or for you).
const CROSSED_A = [
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  ".....FFFFF......",
  "....JJJJJJJ.....",
  "...JJJJJJJJJ....",
  "...JJFFJFFJJ....",
  "...JJJJJJJJJ....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

const CROSSED_B = [
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  ".....FFFFF......",
  "....JJJJJJJ.....",
  "...JJJJJJJJJ....",
  "...JJFFJFFJJ....",
  "...JJJJJJJJJ....",
  "....DD...DD.....",
  "....DD...DD..N..",
  "...NNN...NNN....",
];

// Facepalm: one hand up over the glasses, head bowed.
const PALM_A = [
  "................",
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NNFFF......",
  "....JFFFFFJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJFFJ....",
  "...FF.JJJ.JJ....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

const PALM_B = [
  "................",
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NNFFF......",
  "....JFFFFFJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJFFJ....",
  "...FF.JJJ.JJ....",
  "....DD...DD.....",
  "....DD...DD.....",
  "..NNN.....NNN...",
];

// Present: the GPU held high overhead, glowing — keynote moment.
const PRESENT_A = [
  ".....GGGGG......",
  ".....GGGGG......",
  "...F.......F....",
  "...J.HHHHH.J....",
  "...J.HHHHH.J....",
  "...J.FFFFF.J....",
  "...J.NN.NN.J....",
  "...JJFFFFFJJ....",
  "....JJJJJJJ.....",
  "....JJJJJJJ.....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

const PRESENT_B = [
  "..G..GGGGG..G...",
  ".....GGGGG......",
  "...F.......F....",
  "...J.HHHHH.J....",
  "...J.HHHHH.J....",
  "...J.FFFFF.J....",
  "...J.NN.NN.J....",
  "...JJFFFFFJJ....",
  "....JJJJJJJ.....",
  "....JJJJJJJ.....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

// Standing doze: head sunk between the shoulders.
const DOZE_A = [
  "................",
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  ".....NN.NN......",
  "....JFFFFFJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJ.JJ....",
  "...FF.JJJ.FF....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

const DOZE_B = [
  "................",
  "................",
  "................",
  ".....HHHHH......",
  ".....HHHHH......",
  ".....FFFFF......",
  "....JNNFNNJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJ.JJ....",
  "...FF.JJJ.FF....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

// Glance: the head (hair + glasses) slides a pixel left, then right.
const GLANCE_L = [
  "................",
  "....HHHHH.......",
  "....HHHHH.......",
  "....FFFFF.......",
  "....NN.NN.......",
  "....FFFFF.......",
  "....JJJJJJJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJ.JJ....",
  "...FF.JJJ.FF....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

const GLANCE_R = [
  "................",
  "......HHHHH.....",
  "......HHHHH.....",
  "......FFFFF.....",
  "......NN.NN.....",
  "......FFFFF.....",
  "....JJJJJJJ.....",
  "...JJJJJJJJJ....",
  "...JJ.JJJ.JJ....",
  "...FF.JJJ.FF....",
  "....DD...DD.....",
  "....DD...DD.....",
  "...NNN...NNN....",
];

const WALK = { fps: 5, frames: [STRIDE_A, STRIDE_B] };

export default {
  name: "jensen",
  size: [16, 13],
  palette: PALETTE,
  anims: {
    idle: { fps: 1.5, frames: [STAND, STAND_NOD] },
    walk: WALK,
    walkFront: WALK,
    walkBack: WALK,
    tinker: { fps: 6, frames: [TINKER_A, TINKER_B] },
    crossed: { fps: 3, frames: [CROSSED_A, CROSSED_B] },
    facepalm: { fps: 2, frames: [PALM_A, PALM_B] },
    present: { fps: 4, frames: [PRESENT_A, PRESENT_B] },
    doze: { fps: 1, frames: [DOZE_A, DOZE_B] },
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
