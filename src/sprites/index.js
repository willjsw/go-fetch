// Character registry (GF-118): every selectable sprite sheet, keyed by id.
//
// Each sheet shares the same contract — size [16,13], `anims` with at least
// idle/walk/walkFront/walkBack, and a `stateAnims` map giving that character's
// own motion for each of the six visual states.

import dog from "./dog.js";
import robot from "./robot.js";
import penguin from "./penguin.js";
import terminator from "./terminator.js";
import cat from "./cat.js";
import jensen from "./jensen.js";
import dust from "./dust.js";

export const CHARACTERS = { dog, robot, penguin, terminator, cat, jensen, dust };

/** Display labels for the settings picker, in menu order. */
export const CHARACTER_LABELS = [
  ["dog", "Dog"],
  ["robot", "Robot"],
  ["penguin", "Penguin"],
  ["terminator", "Terminator"],
  ["cat", "Cat"],
  ["jensen", "Jensen Huang"],
  ["dust", "Dust"],
];
