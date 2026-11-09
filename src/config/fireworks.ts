import type { FireworkDefinition } from "@/types";

/**
 * The firework library. Fully data-driven: add an entry here and it appears
 * in the selector with a generated thumbnail, no engine changes needed.
 */
export const FIREWORKS: FireworkDefinition[] = [
  {
    id: "peony", name: "Peony", category: "aerial", kind: "shell", shape: "peony",
    colors: ["#ff3b5c", "#ffd23f"], size: 18, intensity: 1, duration: 1.9,
    velocity: 1, gravity: 4, drag: 1.7, trail: 0.15, sound: "boom",
  },
  {
    id: "chrysanthemum", name: "Chrysanthemum", category: "aerial", kind: "shell", shape: "chrysanthemum",
    colors: ["#5ad1ff", "#ffffff"], size: 20, intensity: 1.1, duration: 2.1,
    velocity: 1, gravity: 4, drag: 1.6, trail: 0.6, sound: "boom",
  },
  {
    id: "willow", name: "Willow", category: "willow", kind: "shell", shape: "willow",
    colors: ["#ffb347", "#ffdf8a"], size: 17, intensity: 0.9, duration: 4.2,
    velocity: 0.9, gravity: 5.5, drag: 2.2, trail: 1, sound: "boom", glitter: true,
  },
  {
    id: "brocade", name: "Brocade", category: "aerial", kind: "shell", shape: "brocade",
    colors: ["#ffcf6b", "#ff8c2a"], size: 21, intensity: 0.85, duration: 3,
    velocity: 1, gravity: 4.5, drag: 1.6, trail: 0.85, sound: "boom", glitter: true,
  },
  {
    id: "palm", name: "Palm", category: "aerial", kind: "shell", shape: "palm",
    colors: ["#ffd36b", "#59ff8f"], size: 22, intensity: 1, duration: 2.6,
    velocity: 1.1, gravity: 6, drag: 1.4, trail: 1, sound: "boom",
  },
  {
    id: "double", name: "Double Ring", category: "aerial", kind: "shell", shape: "double",
    colors: ["#b45cff", "#3cffd0"], size: 20, intensity: 1, duration: 2,
    velocity: 1, gravity: 3.5, drag: 1.7, trail: 0.2, sound: "boom",
  },
  {
    id: "crossette", name: "Crossette", category: "aerial", kind: "shell", shape: "crossette",
    colors: ["#ffe066", "#ff4fd8"], size: 16, intensity: 0.8, duration: 1.3,
    velocity: 1, gravity: 3, drag: 1.4, trail: 0.5, sound: "crackle",
  },
  {
    id: "crackle", name: "Crackling", category: "crackle", kind: "shell", shape: "crackle",
    colors: ["#ffffff", "#ffd27a"], size: 17, intensity: 0.9, duration: 1.6,
    velocity: 1, gravity: 4, drag: 1.8, trail: 0.3, sound: "crackle",
  },
  {
    id: "strobe", name: "Strobe", category: "crackle", kind: "shell", shape: "strobe",
    colors: ["#e9f6ff", "#9fd8ff"], size: 18, intensity: 0.8, duration: 2.8,
    velocity: 0.9, gravity: 3, drag: 2, trail: 0, sound: "boom",
  },
  {
    id: "multicolor", name: "Multicolor", category: "multicolor", kind: "shell", shape: "multicolor",
    colors: null, size: 20, intensity: 1.2, duration: 2.3,
    velocity: 1, gravity: 4, drag: 1.6, trail: 0.25, sound: "boom",
  },
  {
    id: "heart", name: "Heart", category: "shape", kind: "shell", shape: "heart",
    colors: ["#ff4d8d", "#ffc2d9"], size: 16, intensity: 0.8, duration: 1.9,
    velocity: 1, gravity: 1.5, drag: 1.8, trail: 0.1, sound: "boom",
  },
  {
    id: "ring", name: "Ring", category: "shape", kind: "shell", shape: "ring",
    colors: ["#45e3ff", "#ffffff"], size: 17, intensity: 0.7, duration: 1.8,
    velocity: 1, gravity: 2, drag: 1.7, trail: 0.15, sound: "boom",
  },
  {
    id: "star", name: "Star", category: "shape", kind: "shell", shape: "star",
    colors: ["#ffe14d", "#ff8a3d"], size: 17, intensity: 0.8, duration: 1.9,
    velocity: 1, gravity: 1.5, drag: 1.8, trail: 0.1, sound: "boom",
  },
  {
    id: "smiley", name: "Smiley", category: "shape", kind: "shell", shape: "smiley",
    colors: ["#ffd400", "#ffb000"], size: 17, intensity: 0.9, duration: 2,
    velocity: 1, gravity: 1.2, drag: 1.8, trail: 0.05, sound: "boom",
  },
  {
    id: "candle", name: "Roman Candle", category: "candle", kind: "candle", shape: "peony",
    colors: null, size: 14, intensity: 0.6, duration: 1.7,
    velocity: 1, gravity: 6, drag: 0.6, trail: 0.7, sound: "pop", shots: 8, interval: 0.45,
  },
  {
    id: "fountain", name: "Fountain", category: "fountain", kind: "fountain", shape: "brocade",
    colors: ["#ffd98a", "#ffffff"], size: 8, intensity: 1, duration: 1.4,
    velocity: 1, gravity: 9.8, drag: 0.6, trail: 0.2, sound: "hiss", emitDuration: 7, glitter: true,
  },
  {
    id: "comet", name: "Comet", category: "comet", kind: "comet", shape: "crackle",
    colors: ["#7fd7ff", "#ffffff"], size: 15, intensity: 0.8, duration: 1.4,
    velocity: 1, gravity: 4, drag: 1.6, trail: 1, sound: "whistle",
  },
  {
    id: "bomb", name: "Diwali Bomb", category: "bomb", kind: "bomb", shape: "crackle",
    colors: ["#ff8a3d", "#ffe08a"], size: 10, intensity: 1, duration: 1,
    velocity: 1, gravity: 9.8, drag: 2.6, trail: 0, sound: "boom", fuse: 3, follow: "random",
  },
  {
    id: "finale", name: "Grand Finale", category: "finale", kind: "finale", shape: "peony",
    colors: null, size: 20, intensity: 1, duration: 2,
    velocity: 1, gravity: 4, drag: 1.7, trail: 0.3, sound: "boom",
  },
];

export const RANDOM_ID = "random";

/** Ids that may be picked by "Random" and by the finale. */
export const RANDOMIZABLE = FIREWORKS.filter((f) => f.kind === "shell").map((f) => f.id);

export function getFirework(id: string): FireworkDefinition | undefined {
  return FIREWORKS.find((f) => f.id === id);
}

/** Bright, saturated palette used when a definition has no fixed colours. */
export const PALETTE = [
  "#ff3b5c", "#ff8a3d", "#ffd23f", "#59ff8f", "#3cffd0",
  "#45b8ff", "#7a6bff", "#c85cff", "#ff4fd8", "#ffffff",
];
