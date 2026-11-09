import * as THREE from "three";
import { integrate } from "./PhysicsEngine";

/** Behaviour flags packed per particle. */
export const F_TRAIL = 1; // emits embers while alive
export const F_CRACKLE = 2; // pops into tiny sparks on death
export const F_SPLIT = 4; // crossette: splits into 4 on death
export const F_STROBE = 8; // blinks on/off
export const F_GLITTER = 16; // twinkles randomly
export const F_HALO = 32; // big soft flash that fades fast
export const F_SHIFT = 64; // colour transitions to secondary over life
export const F_HOLD = 128; // full brightness until the very end (rocket heads)

export type DeathHandler = (
  flags: number,
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  size: number,
  r: number, g: number, b: number,
) => void;

const SPARK_VERT = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  attribute float size;
  uniform float uPixelScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = size * projectionMatrix[1][1] * uPixelScale / max(-mv.z, 0.05);
    gl_PointSize = clamp(px, 1.0, 160.0);
    vColor = color;
    // Sub-pixel sparks get dimmer instead of vanishing; sparks flying into
    // the lens fade out instead of becoming giant blobs.
    float near = smoothstep(size * 2.0, size * 7.0, -mv.z);
    vAlpha = alpha * clamp(px, 0.25, 1.0) * near;
  }
`;

const SPARK_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float glow = exp(-d * d * 3.2);
    float core = smoothstep(0.5, 0.0, d);
    vec3 col = vColor * (glow * 1.35) + vec3(core * core) * 0.9;
    gl_FragColor = vec4(col, vAlpha * glow);
  }
`;

const SMOKE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = (1.0 - d * d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
  }
`;

/**
 * A fixed-capacity, pooled particle system rendered as a single THREE.Points.
 * Dead particles are swap-removed so the live set is always [0, count).
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  readonly capacity: number;
  count = 0;
  /** Soft limit (adaptive quality); never above capacity. */
  limit: number;

  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private readonly smoke: boolean;

  // Simulation state
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private flags: Uint8Array;
  private col: Float32Array; // base colour
  private col2: Float32Array; // shift-to colour
  private trailCol: Float32Array;
  private trailRate: Float32Array;
  private trailLife: Float32Array;
  private trailAcc: Float32Array;
  private phase: Float32Array;

  // GPU attributes
  private aPos: THREE.BufferAttribute;
  private aCol: THREE.BufferAttribute;
  private aAlpha: THREE.BufferAttribute;
  private aSize: THREE.BufferAttribute;

  private time = 0;
  /** Global brightness cap (reduced-flash setting). */
  flashScale = 1;
  allowStrobe = true;

  constructor(capacity: number, opts: { smoke?: boolean } = {}) {
    this.capacity = capacity;
    this.limit = capacity;
    this.smoke = !!opts.smoke;

    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.col = new Float32Array(capacity * 3);
    this.col2 = new Float32Array(capacity * 3);
    this.trailCol = new Float32Array(capacity * 3);
    this.trailRate = new Float32Array(capacity);
    this.trailLife = new Float32Array(capacity);
    this.trailAcc = new Float32Array(capacity);
    this.phase = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", this.aPos);
    this.geometry.setAttribute("color", this.aCol);
    this.geometry.setAttribute("alpha", this.aAlpha);
    this.geometry.setAttribute("size", this.aSize);
    this.geometry.setDrawRange(0, 0);
    // Particles move everywhere; skip frustum culling of the whole cloud.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uPixelScale: { value: 400 } },
      vertexShader: SPARK_VERT,
      fragmentShader: this.smoke ? SMOKE_FRAG : SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: this.smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = this.smoke ? 0 : 1;
  }

  set pixelScale(v: number) {
    this.material.uniforms.uPixelScale.value = v;
  }

  get free(): number {
    return Math.max(0, Math.min(this.limit, this.capacity) - this.count);
  }

  /** Spawn one particle. Returns its index (valid until next update) or -1 if full. */
  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number,
    r: number, g: number, b: number,
    drag: number, grav: number, flags = 0,
  ): number {
    if (this.count >= this.limit || this.count >= this.capacity) return -1;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.col2[i3] = r; this.col2[i3 + 1] = g; this.col2[i3 + 2] = b;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.flags[i] = flags;
    this.trailRate[i] = 0;
    this.trailAcc[i] = Math.random();
    this.phase[i] = Math.random() * 6.283;
    return i;
  }

  setShift(i: number, r: number, g: number, b: number): void {
    if (i < 0) return;
    const i3 = i * 3;
    this.col2[i3] = r; this.col2[i3 + 1] = g; this.col2[i3 + 2] = b;
    this.flags[i] |= F_SHIFT;
  }

  setTrail(i: number, rate: number, life: number, r: number, g: number, b: number): void {
    if (i < 0) return;
    const i3 = i * 3;
    this.trailRate[i] = rate;
    this.trailLife[i] = life;
    this.trailCol[i3] = r; this.trailCol[i3 + 1] = g; this.trailCol[i3 + 2] = b;
    this.flags[i] |= F_TRAIL;
  }

  clear(): void {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
  }

  update(dt: number, onDeath?: DeathHandler, windX = 0): void {
    this.time += dt;
    const n0 = this.count;
    integrate(this.pos, this.vel, this.drag, this.grav, n0, dt, windX);

    // Trail emission (embers). New particles are appended past n0 and are
    // not processed this frame.
    for (let i = 0; i < n0; i++) {
      if (!(this.flags[i] & F_TRAIL) || this.trailRate[i] <= 0) continue;
      const lifeFrac = this.life[i] / this.maxLife[i];
      this.trailAcc[i] += this.trailRate[i] * dt * (1 - lifeFrac * 0.6);
      const i3 = i * 3;
      const s = this.baseSize[i];
      const glitter = (this.flags[i] & F_GLITTER) !== 0;
      while (this.trailAcc[i] >= 1) {
        this.trailAcc[i] -= 1;
        const j = this.spawn(
          this.pos[i3] - this.vel[i3] * dt * Math.random(),
          this.pos[i3 + 1] - this.vel[i3 + 1] * dt * Math.random(),
          this.pos[i3 + 2] - this.vel[i3 + 2] * dt * Math.random(),
          this.vel[i3] * 0.08 + (Math.random() - 0.5) * s * 0.6,
          this.vel[i3 + 1] * 0.08 + (Math.random() - 0.5) * s * 0.6,
          this.vel[i3 + 2] * 0.08 + (Math.random() - 0.5) * s * 0.6,
          this.trailLife[i] * (0.6 + Math.random() * 0.6),
          s * (0.45 + Math.random() * 0.25),
          this.trailCol[i3], this.trailCol[i3 + 1], this.trailCol[i3 + 2],
          2.5, this.grav[i] * 0.35, glitter ? F_GLITTER : 0,
        );
        if (j < 0) { this.trailAcc[i] = 0; break; }
      }
    }

    // Age, write GPU attributes, remove dead (swap with last).
    const P = this.aPos.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const A = this.aAlpha.array as Float32Array;
    const S = this.aSize.array as Float32Array;
    const smoke = this.smoke;
    const fs = this.flashScale;

    let i = 0;
    while (i < this.count) {
      // Particles spawned this frame (i >= n0) age from 0 next frame.
      if (i < n0) this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      if (t >= 1) {
        const f = this.flags[i];
        if (onDeath && (f & (F_CRACKLE | F_SPLIT))) {
          const i3 = i * 3;
          onDeath(
            f,
            this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2],
            this.vel[i3], this.vel[i3 + 1], this.vel[i3 + 2],
            this.baseSize[i],
            this.col2[i3], this.col2[i3 + 1], this.col2[i3 + 2],
          );
        }
        this.removeAt(i);
        continue; // re-check the particle swapped into slot i
      }

      const i3 = i * 3;
      const f = this.flags[i];
      let alpha: number;
      let size = this.baseSize[i];
      let r = this.col[i3], g = this.col[i3 + 1], b = this.col[i3 + 2];

      if (smoke) {
        alpha = Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.05)) * 0.22 * (1 - t);
        size *= 1 + t * 2.2;
      } else if (f & F_HALO) {
        alpha = Math.pow(1 - t, 3) * 0.9 * fs;
        size *= 0.7 + t * 0.6;
      } else {
        if (f & F_HOLD) alpha = t < 0.85 ? 1 : (1 - t) / 0.15;
        else alpha = t < 0.55 ? 1 : Math.pow((1 - t) / 0.45, 1.6);
        size *= 0.55 + 0.45 * (1 - t);
        if (f & F_SHIFT) {
          const k = Math.min(1, t * 1.4);
          r += (this.col2[i3] - r) * k;
          g += (this.col2[i3 + 1] - g) * k;
          b += (this.col2[i3 + 2] - b) * k;
        }
        // Freshly burst stars burn white-hot for an instant.
        if (t < 0.08) {
          const w = 1 - t / 0.08;
          r += (1 - r) * w * 0.7; g += (1 - g) * w * 0.7; b += (1 - b) * w * 0.7;
        }
        if ((f & F_STROBE) && this.allowStrobe) {
          alpha *= Math.sin(this.phase[i] + this.time * 28) > 0.1 ? 1 : 0.04;
        }
        if (f & F_GLITTER) alpha *= 0.35 + Math.random() * 0.65;
        alpha *= fs;
      }

      P[i3] = this.pos[i3]; P[i3 + 1] = this.pos[i3 + 1]; P[i3 + 2] = this.pos[i3 + 2];
      C[i3] = r; C[i3 + 1] = g; C[i3 + 2] = b;
      A[i] = alpha;
      S[i] = size;
      i++;
    }

    const n = this.count;
    this.geometry.setDrawRange(0, n);
    for (const attr of [this.aPos, this.aCol]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * 3);
      attr.needsUpdate = true;
    }
    for (const attr of [this.aAlpha, this.aSize]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n);
      attr.needsUpdate = true;
    }
  }

  private removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    const i3 = i * 3, l3 = last * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[l3 + k];
      this.vel[i3 + k] = this.vel[l3 + k];
      this.col[i3 + k] = this.col[l3 + k];
      this.col2[i3 + k] = this.col2[l3 + k];
      this.trailCol[i3 + k] = this.trailCol[l3 + k];
    }
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.baseSize[i] = this.baseSize[last];
    this.drag[i] = this.drag[last];
    this.grav[i] = this.grav[last];
    this.flags[i] = this.flags[last];
    this.trailRate[i] = this.trailRate[last];
    this.trailLife[i] = this.trailLife[last];
    this.trailAcc[i] = this.trailAcc[last];
    this.phase[i] = this.phase[last];
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
