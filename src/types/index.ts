/** Shared types for Fireworks AR. */

export type Mode = "sky" | "world";

/** How a firework is physically produced. */
export type FireworkKind = "shell" | "candle" | "fountain" | "comet" | "bomb" | "finale";

/** The pattern a shell's stars form when it bursts. */
export type BurstShape =
  | "peony"
  | "chrysanthemum"
  | "willow"
  | "brocade"
  | "palm"
  | "ring"
  | "heart"
  | "star"
  | "smiley"
  | "double"
  | "crossette"
  | "crackle"
  | "multicolor"
  | "strobe";

export type FireworkCategory =
  | "aerial"
  | "candle"
  | "fountain"
  | "comet"
  | "willow"
  | "crackle"
  | "shape"
  | "multicolor"
  | "bomb"
  | "finale";

export type SoundKind = "boom" | "crackle" | "whistle" | "hiss" | "pop" | "none";

/**
 * A data-driven firework definition. New effects are added by appending
 * entries to `src/config/fireworks.ts`; the engine needs no changes.
 */
export interface FireworkDefinition {
  id: string;
  name: string;
  category: FireworkCategory;
  kind: FireworkKind;
  /** Burst pattern for shells, candles and comets. */
  shape: BurstShape;
  /** Primary and secondary colours (CSS hex). `null` = random palette per launch. */
  colors: [string, string] | null;
  /** Explosion radius in metres at sky scale. */
  size: number;
  /** Particle quantity multiplier (1 = ~ 200 stars). */
  intensity: number;
  /** Star lifetime in seconds. */
  duration: number;
  /** Burst velocity multiplier. */
  velocity: number;
  /** Downward acceleration in m/s² at sky scale. */
  gravity: number;
  /** Air resistance coefficient (per second). */
  drag: number;
  /** Trail length 0..1 (0 = none). */
  trail: number;
  /** Sound played when it bursts (or for its lifetime, for fountains). */
  sound: SoundKind;
  /** Kind-specific options. */
  shots?: number; // roman candle shots
  interval?: number; // seconds between candle shots
  emitDuration?: number; // fountain duration
  glitter?: boolean; // trails twinkle
  fuse?: number; // bomb: seconds of burning fuse before the blast
  /** bomb: firework launched from the blast spot ("random" = any shell). */
  follow?: string;
}

export type QualityLevel = "auto" | "high" | "medium" | "low";
export type Level3 = "low" | "medium" | "high";

export interface Settings {
  sound: boolean;
  quality: QualityLevel;
  intensity: Level3;
  motion: "normal" | "reduced";
  flash: "normal" | "reduced";
  facing: "environment" | "user";
  recordingQuality: "auto" | "high" | "standard";
  /** Use device orientation (gyroscope) to keep fireworks fixed in space. */
  tracking: boolean;
}

export type CameraStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "insecure"
  | "interrupted"
  | "stopped"
  | "none"; // user chose to continue without a camera

export interface CapturedMedia {
  kind: "photo" | "video";
  blob: Blob;
  url: string;
  filename: string;
}
