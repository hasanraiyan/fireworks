import type { Settings } from "@/types";

const KEY = "fireworks-ar:settings:v1";

export function defaultSettings(): Settings {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return {
    sound: true,
    quality: "auto",
    intensity: "medium",
    motion: reduced ? "reduced" : "normal",
    flash: reduced ? "reduced" : "normal",
    facing: "environment",
    recordingQuality: "auto",
    tracking: true,
  };
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...base, ...parsed };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — settings just won't persist */
  }
}

export const INTENSITY_FACTOR: Record<Settings["intensity"], number> = {
  low: 0.55,
  medium: 1,
  high: 1.5,
};

export interface QualityProfile {
  pixelRatio: number;
  maxParticles: number;
  smoke: boolean;
}

/** Ordered high → low; "auto" walks this ladder based on measured FPS. */
export function qualityLadder(): QualityProfile[] {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return [
    { pixelRatio: Math.min(dpr, 2), maxParticles: 30000, smoke: true },
    { pixelRatio: Math.min(dpr, 1.5), maxParticles: 18000, smoke: true },
    { pixelRatio: 1, maxParticles: 9000, smoke: false },
  ];
}
