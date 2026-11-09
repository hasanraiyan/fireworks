import type { FireworkDefinition } from "@/types";
import { PALETTE } from "@/config/fireworks";
import {
  ParticleSystem, F_CRACKLE, F_GLITTER, F_HALO, F_SPLIT, F_STROBE, F_HOLD,
} from "./ParticleSystem";
import { burstSpeed } from "./PhysicsEngine";
import { sphere, ring3d, palm, planarPattern, PLANAR, type Vec3 } from "./shapes";

export type RGB = [number, number, number];

export interface Basis {
  right: Vec3;
  up: Vec3;
  fwd: Vec3; // from camera toward the scene
}

export interface BurstOptions {
  def: FireworkDefinition;
  x: number; y: number; z: number;
  /** World scale: 1 = sky scale (burst radius = def.size metres). */
  scale: number;
  basis: Basis;
  c1: RGB;
  c2: RGB;
  /** Particle multiplier from settings × quality. */
  amount: number;
  reducedFlash: boolean;
  smoke: ParticleSystem | null;
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function randomPaletteColor(): RGB {
  return hexToRgb(PALETTE[(Math.random() * PALETTE.length) | 0]);
}

/** Small hue/brightness jitter so repeated launches never look identical. */
export function jitterColor(c: RGB, amt = 0.08): RGB {
  return [
    clamp01(c[0] + (Math.random() - 0.5) * amt),
    clamp01(c[1] + (Math.random() - 0.5) * amt),
    clamp01(c[2] + (Math.random() - 0.5) * amt),
  ];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const GOLD: RGB = [1, 0.72, 0.32];

/** Base star size in metres at sky scale. */
export const STAR_SIZE = 1.35;

/** Resolve the launch colours for a definition (fixed or random palette). */
export function resolveColors(def: FireworkDefinition): [RGB, RGB] {
  if (def.colors) return [jitterColor(hexToRgb(def.colors[0])), jitterColor(hexToRgb(def.colors[1]))];
  const a = randomPaletteColor();
  let b = randomPaletteColor();
  if (a.join() === b.join()) b = randomPaletteColor();
  return [a, b];
}

/**
 * Explode a shell. Returns the number of stars created (for budgeting).
 */
export function burst(ps: ParticleSystem, o: BurstOptions): number {
  const { def, x, y, z, scale: s, basis, c1, c2 } = o;
  const R = def.size * s * rnd(0.88, 1.12);
  const drag = def.drag;
  const v0 = burstSpeed(R, drag) * def.velocity;
  const grav = def.gravity * s;
  const life = def.duration;
  const size = STAR_SIZE * s;
  // Never use more than ~70% of the remaining pool on one shell.
  const want = Math.round(200 * def.intensity * o.amount);
  let count = Math.max(12, Math.min(want, Math.floor(ps.free * 0.7)));
  if (ps.free < 20) return 0;

  // Bright flash at the burst point.
  const haloSize = o.reducedFlash ? R * 0.35 : R * 1.1;
  ps.spawn(x, y, z, 0, 0, 0, o.reducedFlash ? 0.2 : 0.4, haloSize,
    (c1[0] + 1) / 2, (c1[1] + 1) / 2, (c1[2] + 1) / 2, 0, 0, F_HALO);

  const trailRate = def.trail * 45;
  const trailLife = 0.2 + def.trail * 0.6;

  const star = (dx: number, dy: number, dz: number, speed: number, col: RGB, flags = 0, lifeMul = 1, sizeMul = 1) => {
    const i = ps.spawn(
      x, y, z,
      dx * speed, dy * speed, dz * speed,
      life * lifeMul * rnd(0.85, 1.1), size * sizeMul,
      col[0], col[1], col[2], drag, grav, flags,
    );
    return i;
  };

  const glitter = def.glitter ? F_GLITTER : 0;

  switch (def.shape) {
    case "peony": {
      for (const d of sphere(count)) {
        const i = star(d[0], d[1], d[2], v0, c1);
        ps.setShift(i, c2[0], c2[1], c2[2]);
        if (trailRate > 0) ps.setTrail(i, trailRate, trailLife, c1[0] * 0.8, c1[1] * 0.8, c1[2] * 0.8);
      }
      break;
    }
    case "chrysanthemum": {
      for (const d of sphere(count)) {
        const i = star(d[0], d[1], d[2], v0, c1);
        ps.setTrail(i, trailRate, trailLife, c2[0], c2[1] * 0.9, c2[2] * 0.8);
      }
      break;
    }
    case "willow":
    case "brocade": {
      count = Math.round(count * (def.shape === "willow" ? 0.55 : 0.6));
      for (const d of sphere(count)) {
        const i = star(d[0], d[1], d[2], v0, c1, F_HOLD | glitter, 1, 0.9);
        ps.setTrail(i, trailRate, trailLife * (def.shape === "willow" ? 2.2 : 1.3), GOLD[0], GOLD[1] * 0.92, GOLD[2]);
        ps.setShift(i, c2[0], c2[1], c2[2]);
      }
      break;
    }
    case "palm": {
      const fronds = 8 + ((Math.random() * 5) | 0);
      for (const d of palm(fronds)) {
        const i = star(d[0], d[1], d[2], v0 * 1.1, c1, F_HOLD, 1, 1.4);
        ps.setTrail(i, 110, 0.75, GOLD[0], GOLD[1], GOLD[2]);
      }
      for (const d of sphere(Math.round(count * 0.25))) {
        const i = star(d[0], d[1], d[2], v0 * 0.35, c2, 0, 0.6);
        ps.setShift(i, 1, 1, 1);
      }
      break;
    }
    case "ring": {
      for (const d of ring3d(Math.round(count * 0.55))) star(d[0], d[1], d[2], v0, c1);
      for (const d of sphere(Math.round(count * 0.15))) star(d[0], d[1], d[2], v0 * 0.3, c2, 0, 0.7);
      break;
    }
    case "double": {
      for (const d of sphere(Math.round(count * 0.7))) {
        const i = star(d[0], d[1], d[2], v0, c1);
        ps.setShift(i, c2[0], c2[1], c2[2]);
      }
      for (const d of ring3d(Math.round(count * 0.35))) star(d[0], d[1], d[2], v0 * 0.55, c2, 0, 1.1);
      break;
    }
    case "crossette": {
      const n = Math.max(10, Math.round(count * 0.12));
      for (const d of sphere(n)) {
        const i = star(d[0], d[1], d[2], v0 * 0.8, c1, F_SPLIT | F_HOLD, 1, 1.4);
        ps.setTrail(i, 50, 0.35, c1[0], c1[1], c1[2]);
        ps.setShift(i, c2[0], c2[1], c2[2]); // split colour
      }
      break;
    }
    case "crackle": {
      for (const d of sphere(count)) {
        const crackle = Math.random() < 0.7 ? F_CRACKLE : 0;
        const i = star(d[0], d[1], d[2], v0, Math.random() < 0.5 ? c1 : c2, crackle | F_HOLD, rnd(0.6, 1.25), 0.9);
        if (trailRate > 0) ps.setTrail(i, trailRate, trailLife, GOLD[0], GOLD[1], GOLD[2]);
      }
      break;
    }
    case "strobe": {
      for (const d of sphere(Math.round(count * 0.8))) {
        star(d[0], d[1], d[2], v0, Math.random() < 0.6 ? c1 : c2, F_STROBE | F_HOLD, 1, 1.1);
      }
      break;
    }
    case "multicolor": {
      for (const d of sphere(count)) {
        const a = randomPaletteColor();
        const b = randomPaletteColor();
        const i = star(d[0], d[1], d[2], v0, a);
        ps.setShift(i, b[0], b[1], b[2]);
        if (trailRate > 0) ps.setTrail(i, trailRate, trailLife, a[0] * 0.8, a[1] * 0.8, a[2] * 0.8);
      }
      break;
    }
    default: {
      if (PLANAR.has(def.shape)) {
        const { right: r, up: u, fwd: f } = basis;
        const n = Math.round(count * 0.75);
        for (const [px, py] of planarPattern(def.shape, n)) {
          const depth = (Math.random() - 0.5) * 0.06;
          const dx = px * r[0] + py * u[0] + depth * f[0];
          const dy = px * r[1] + py * u[1] + depth * f[1];
          const dz = px * r[2] + py * u[2] + depth * f[2];
          const i = star(dx, dy, dz, v0 * 0.9, c1, F_HOLD, 1, 1);
          ps.setShift(i, c2[0], c2[1], c2[2]);
        }
      } else {
        for (const d of sphere(count)) star(d[0], d[1], d[2], v0, c1);
      }
    }
  }

  // Lingering smoke where the shell broke.
  if (o.smoke) {
    const puffs = 7;
    for (let k = 0; k < puffs; k++) {
      const d = sphere(puffs)[k];
      const sp = burstSpeed(R * 0.5, 1.2) * rnd(0.4, 1);
      o.smoke.spawn(x, y, z, d[0] * sp, d[1] * sp, d[2] * sp, rnd(3.5, 6), R * rnd(0.35, 0.55),
        0.55, 0.55, 0.6, 1.2, -0.15 * s, 0);
    }
  }
  return count;
}

/**
 * Secondary effects when flagged stars burn out. Returns true if it crackled
 * (so the caller can play a sound).
 */
export function onStarDeath(
  ps: ParticleSystem,
  flags: number,
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  size: number,
  r: number, g: number, b: number,
): "crackle" | "split" | null {
  const s = size / STAR_SIZE;
  if (flags & F_SPLIT) {
    // Crossette: break into 4 stars flying out sideways.
    const len = Math.hypot(vx, vy, vz) || 1;
    const fx = vx / len, fy = vy / len, fz = vz / len;
    // Any vector perpendicular to the flight direction.
    let ax = -fz, ay = 0, az = fx;
    if (Math.abs(fy) > 0.9) { ax = 1; ay = 0; az = 0; }
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = fy * az - fz * ay, by = fz * ax - fx * az, bz = fx * ay - fy * ax;
    const sp = 9 * s;
    const dirs: Vec3[] = [[ax, ay, az], [-ax, -ay, -az], [bx, by, bz], [-bx, -by, -bz]];
    for (const d of dirs) {
      const i = ps.spawn(x, y, z, d[0] * sp + vx * 0.3, d[1] * sp + vy * 0.3, d[2] * sp + vz * 0.3,
        rnd(0.6, 0.9), size * 0.9, r, g, b, 1.6, 3 * s, F_HOLD);
      ps.setTrail(i, 40, 0.3, r, g, b);
    }
    return "split";
  }
  if (flags & F_CRACKLE) {
    const n = 3 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const sp = rnd(4, 8) * s;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      ps.spawn(x, y, z,
        Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp,
        rnd(0.08, 0.22), size * 0.7, 1, 0.95, 0.85, 5, 0, 0);
    }
    return "crackle";
  }
  return null;
}
