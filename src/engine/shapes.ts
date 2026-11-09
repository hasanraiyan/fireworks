/**
 * Burst pattern generators. Each returns velocity directions with magnitude
 * ~0..1 (1 = full burst speed). 3D patterns are in world space; planar
 * patterns are 2D (x right, y up) and are oriented to face the viewer.
 * Shared by the engine and the thumbnail renderer.
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Evenly distributed directions on a sphere, with slight jitter. */
export function sphere(count: number, jitter = 0.08, rand = Math.random): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GOLDEN * i;
    const m = 1 - jitter + rand() * jitter;
    out.push([Math.cos(th) * r * m, y * m, Math.sin(th) * r * m]);
  }
  return out;
}

/** Points on a circle (planar). */
export function circle(count: number, rand = Math.random): Vec2[] {
  const out: Vec2[] = [];
  const off = rand() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = off + (i / count) * Math.PI * 2;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
}

/** Classic parametric heart, normalised to ~unit size (planar). */
export function heart(count: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([x / 17, (y + 2) / 17]);
  }
  return out;
}

/** Five-pointed star outline (planar). */
export function star(count: number): Vec2[] {
  const out: Vec2[] = [];
  const pts: Vec2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.42;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i < count; i++) {
    const f = (i / count) * 10;
    const k = Math.floor(f);
    const t = f - k;
    const a = pts[k];
    const b = pts[(k + 1) % 10];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Smiley face: outline, two eyes and a smile (planar). */
export function smiley(count: number): Vec2[] {
  const out: Vec2[] = [];
  const face = Math.round(count * 0.55);
  const eyes = Math.round(count * 0.12);
  const mouth = count - face - eyes * 2;
  for (let i = 0; i < face; i++) {
    const a = (i / face) * Math.PI * 2;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  for (const ex of [-0.35, 0.35]) {
    for (let i = 0; i < eyes; i++) {
      const a = (i / eyes) * Math.PI * 2;
      out.push([ex + Math.cos(a) * 0.1, 0.3 + Math.sin(a) * 0.14]);
    }
  }
  for (let i = 0; i < mouth; i++) {
    const a = Math.PI * (1.15 + (i / Math.max(1, mouth - 1)) * 0.7);
    out.push([Math.cos(a) * 0.58, Math.sin(a) * 0.58 + 0.02]);
  }
  return out;
}

/** A tilted ring in 3D: circle in a random plane. */
export function ring3d(count: number, rand = Math.random): Vec3[] {
  const tilt = (rand() - 0.5) * 1.2;
  const yaw = rand() * Math.PI;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return circle(count, rand).map(([x, y]) => {
    // ring in XY plane → tilt about X → yaw about Y
    const y1 = y * ct;
    const z1 = y * st;
    return [x * cy + z1 * sy, y1, -x * sy + z1 * cy] as Vec3;
  });
}

/** Palm fronds: a handful of strong, slightly upward directions. */
export function palm(count: number, rand = Math.random): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.3;
    const el = 0.15 + rand() * 0.55; // elevation above horizon
    const r = Math.cos(el);
    out.push([Math.cos(a) * r, Math.sin(el), Math.sin(a) * r]);
  }
  return out;
}

/** Shapes that should be drawn facing the camera. */
export const PLANAR = new Set(["heart", "star", "smiley"]);

export function planarPattern(shape: string, count: number): Vec2[] {
  switch (shape) {
    case "heart":
      return heart(count);
    case "star":
      return star(count);
    case "smiley":
      return smiley(count);
    default:
      return circle(count);
  }
}
