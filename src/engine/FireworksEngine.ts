import * as THREE from "three";
import type { FireworkDefinition } from "@/types";
import { ParticleSystem, F_HOLD, F_GLITTER, F_HALO, F_CRACKLE } from "./ParticleSystem";
import {
  burst, onStarDeath, resolveColors, randomPaletteColor, STAR_SIZE, type Basis, type RGB,
} from "./FireworkFactory";
import { easeOutQuad } from "./PhysicsEngine";
import type { SoundEngine } from "@/audio/SoundEngine";
import type { Vec3 } from "./shapes";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Rocket {
  type: "rocket";
  def: FireworkDefinition;
  start: THREE.Vector3;
  target: THREE.Vector3;
  t: number;
  dur: number;
  scale: number;
  basis: Basis;
  c1: RGB;
  c2: RGB;
  comet: boolean;
  dist: number;
}

interface Candle {
  type: "candle";
  def: FireworkDefinition;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  height: number;
  scale: number;
  shotsLeft: number;
  timer: number;
  dist: number;
}

interface Fountain {
  type: "fountain";
  def: FireworkDefinition;
  origin: THREE.Vector3;
  up: THREE.Vector3;
  scale: number;
  t: number;
  dur: number;
  acc: number;
  c1: RGB;
  c2: RGB;
}

interface Bomb {
  type: "bomb";
  def: FireworkDefinition;
  origin: THREE.Vector3;
  up: THREE.Vector3;
  scale: number;
  t: number;
  fuse: number;
  acc: number;
  mesh: THREE.Group;
  fuseLine: THREE.Mesh;
  plan: LaunchPlan;
  dist: number;
}

type Entity = Rocket | Candle | Fountain | Bomb;

interface Scheduled {
  at: number;
  fn: () => void;
}

export interface EngineOptions {
  /** Particle multiplier from settings × quality ladder. */
  amount: number;
  reducedFlash: boolean;
  reducedMotion: boolean;
  smoke: boolean;
}

/** Placement for a launch, in world coordinates. */
export interface LaunchPlan {
  /** Where the effect starts (ground / tube). */
  origin: THREE.Vector3;
  /** Where a shell bursts (sky target). Ignored by fountains. */
  target: THREE.Vector3;
  /** Local "up" for ground effects (surface normal in World mode). */
  up: THREE.Vector3;
  scale: number;
  basis: Basis;
  /** Distance from the viewer (for sound volume). */
  distance: number;
  /** Bomb: firework launched from the blast spot, and its scale. */
  follow?: FireworkDefinition;
  followScale?: number;
}

/**
 * Owns the particle pools and every live firework. Pure simulation +
 * THREE.Points; knows nothing about cameras, DOM or input.
 */
export class FireworksEngine {
  readonly group = new THREE.Group();
  readonly sparks: ParticleSystem;
  readonly smoke: ParticleSystem;
  private entities: Entity[] = [];
  private scheduled: Scheduled[] = [];
  private time = 0;
  private crackles = 0;
  private wind = rnd(-0.6, 0.6);
  opts: EngineOptions = { amount: 1, reducedFlash: false, reducedMotion: false, smoke: true };
  sound: SoundEngine | null = null;

  static readonly MAX_ENTITIES = 28;

  constructor(capacity = 30000) {
    this.sparks = new ParticleSystem(capacity);
    this.smoke = new ParticleSystem(1200, { smoke: true });
    this.group.add(this.smoke.points);
    this.group.add(this.sparks.points);
  }

  setLimit(maxParticles: number): void {
    this.sparks.limit = Math.min(maxParticles, this.sparks.capacity);
  }

  setOptions(o: Partial<EngineOptions>): void {
    this.opts = { ...this.opts, ...o };
    this.sparks.flashScale = this.opts.reducedFlash ? 0.7 : 1;
    this.sparks.allowStrobe = !this.opts.reducedFlash;
    this.smoke.points.visible = this.opts.smoke;
  }

  set pixelScale(v: number) {
    this.sparks.pixelScale = v;
    this.smoke.pixelScale = v;
  }

  get busy(): boolean {
    return this.entities.length >= FireworksEngine.MAX_ENTITIES || this.sparks.free < 300;
  }

  get activeCount(): number {
    return this.entities.length + this.sparks.count;
  }

  schedule(delay: number, fn: () => void): void {
    this.scheduled.push({ at: this.time + delay, fn });
  }

  /** Launch any definition according to its kind. Returns false if throttled. */
  launch(def: FireworkDefinition, plan: LaunchPlan): boolean {
    if (this.busy) return false;
    const [c1, c2] = resolveColors(def);
    const vol = this.volumeFor(plan.distance, plan.scale);
    switch (def.kind) {
      case "shell":
      case "comet": {
        const comet = def.kind === "comet";
        const rise = plan.origin.distanceTo(plan.target);
        const speedScale = Math.max(plan.scale, 0.05);
        // Rockets take ~1.2–1.8 s regardless of scale (it reads as "real").
        const dur = THREE.MathUtils.clamp((rise / (55 * speedScale)) * 1.4, 0.9, 2.0) * (comet ? 1.15 : 1);
        this.entities.push({
          type: "rocket", def, comet, c1, c2, basis: plan.basis, scale: plan.scale,
          start: plan.origin.clone(), target: plan.target.clone(), t: 0, dur, dist: plan.distance,
        });
        this.sound?.launch(vol * 0.6, comet || Math.random() < 0.3);
        return true;
      }
      case "candle": {
        const height = plan.origin.distanceTo(plan.target);
        const dir = plan.target.clone().sub(plan.origin).normalize();
        this.entities.push({
          type: "candle", def, origin: plan.origin.clone(), dir, height, scale: plan.scale,
          shotsLeft: def.shots ?? 8, timer: 0, dist: plan.distance,
        });
        return true;
      }
      case "bomb": {
        const fuse = (def.fuse ?? 3) * rnd(0.85, 1.15);
        const mesh = this.makeBombMesh(plan.scale, plan.up);
        mesh.position.copy(plan.origin);
        this.group.add(mesh);
        this.entities.push({
          type: "bomb", def, origin: plan.origin.clone(), up: plan.up.clone().normalize(),
          scale: plan.scale, t: 0, fuse, acc: 0, mesh, fuseLine: mesh.userData.fuse as THREE.Mesh,
          plan, dist: plan.distance,
        });
        this.sound?.fuse(fuse, vol);
        return true;
      }
      case "fountain": {
        const dur = def.emitDuration ?? 6;
        this.entities.push({
          type: "fountain", def, origin: plan.origin.clone(), up: plan.up.clone().normalize(),
          scale: plan.scale, t: 0, dur, acc: 0, c1, c2,
        });
        this.sound?.hiss(dur, vol);
        return true;
      }
      default:
        return false;
    }
  }

  private volumeFor(distance: number, scale: number): number {
    // Sky shells at ~100 m are "loud"; near world effects are scaled down.
    const ref = 100 * Math.max(scale, 0.05);
    return THREE.MathUtils.clamp((ref / Math.max(distance, 1)) * 0.8, 0.15, 1);
  }

  update(dt: number): void {
    // Clamp huge steps (tab switches) so nothing teleports.
    dt = Math.min(dt, 1 / 20);
    this.time += dt;

    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.at <= this.time);
      if (due.length) {
        this.scheduled = this.scheduled.filter((s) => s.at > this.time);
        for (const s of due) s.fn();
      }
    }

    for (let k = this.entities.length - 1; k >= 0; k--) {
      const e = this.entities[k];
      let done = false;
      if (e.type === "rocket") done = this.updateRocket(e, dt);
      else if (e.type === "candle") done = this.updateCandle(e, dt);
      else if (e.type === "bomb") done = this.updateBomb(e, dt);
      else done = this.updateFountain(e, dt);
      if (done) this.entities.splice(k, 1);
    }

    this.crackles = 0;
    let splits = 0;
    this.sparks.update(dt, (flags, x, y, z, vx, vy, vz, size, r, g, b) => {
      const res = onStarDeath(this.sparks, flags, x, y, z, vx, vy, vz, size, r, g, b);
      if (res === "crackle") this.crackles++;
      else if (res === "split") splits++;
    }, this.wind);
    if (this.opts.smoke) this.smoke.update(dt, undefined, this.wind);
    else if (this.smoke.count) this.smoke.clear();

    if (this.crackles > 0) this.sound?.crackle(this.crackles / 3, 0.8);
    if (splits > 0) this.sound?.crackle(splits, 1);
  }

  private updateRocket(r: Rocket, dt: number): boolean {
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    const e = easeOutQuad(k);
    const s = r.scale;
    const px = r.start.x + (r.target.x - r.start.x) * e + Math.sin(r.t * 23) * 0.08 * s;
    const py = r.start.y + (r.target.y - r.start.y) * e;
    const pz = r.start.z + (r.target.z - r.start.z) * e;
    const ps = this.sparks;

    // Bright head (re-spawned each frame so it never needs tracking).
    const headCol: RGB = r.comet ? r.c1 : [1, 0.8, 0.5];
    ps.spawn(px, py, pz, 0, 0, 0, dt * 1.5, STAR_SIZE * s * (r.comet ? 2.2 : 1.1),
      headCol[0], headCol[1], headCol[2], 0, 0, F_HOLD);

    // Sparky tail falling back down.
    const n = r.comet ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const sp = rnd(0.5, 2.5) * s;
      const col: RGB = r.comet ? (Math.random() < 0.5 ? r.c1 : r.c2) : [1, 0.65 + Math.random() * 0.2, 0.3];
      ps.spawn(px, py, pz, (Math.random() - 0.5) * sp, -rnd(1, 4) * s, (Math.random() - 0.5) * sp,
        rnd(0.25, r.comet ? 0.9 : 0.6), STAR_SIZE * s * rnd(0.35, 0.6), col[0], col[1], col[2], 2, 4 * s,
        r.comet ? F_GLITTER : 0);
    }

    if (k < 1) return false;

    if (r.comet) {
      // Comets end in a short crackling spray rather than a full shell.
      burst(ps, {
        def: { ...r.def, intensity: r.def.intensity * 0.45, size: r.def.size * 0.55 },
        x: px, y: py, z: pz, scale: s, basis: r.basis, c1: r.c1, c2: r.c2,
        amount: this.opts.amount, reducedFlash: true, smoke: null,
      });
      this.sound?.crackle(4, this.volumeFor(r.dist, s));
      return true;
    }

    burst(ps, {
      def: r.def, x: px, y: py, z: pz, scale: s, basis: r.basis, c1: r.c1, c2: r.c2,
      amount: this.opts.amount, reducedFlash: this.opts.reducedFlash,
      smoke: this.opts.smoke ? this.smoke : null,
    });
    const vol = this.volumeFor(r.dist, s);
    // A hint of the speed of sound, kept short so it still feels in sync.
    const delay = Math.min(0.25, r.dist / 1200);
    if (r.def.sound === "crackle") {
      this.sound?.boom(vol * 0.7, r.def.size / 18, delay);
      this.schedule(r.def.duration * 0.6, () => this.sound?.crackle(6, vol));
    } else {
      this.sound?.boom(vol, r.def.size / 18, delay);
    }
    return true;
  }

  private updateCandle(c: Candle, dt: number): boolean {
    c.timer -= dt;
    if (c.timer > 0) return false;
    if (c.shotsLeft <= 0) return true;
    c.shotsLeft--;
    c.timer = (c.def.interval ?? 0.45) * rnd(0.8, 1.2);

    const s = c.scale;
    const g = c.def.gravity * s;
    // Enough speed to reach ~the requested height despite drag.
    const h = c.height * rnd(0.75, 1.05);
    const v = Math.sqrt(2 * g * h) * 1.35;
    const spread = 0.12;
    const vx = (c.dir.x + (Math.random() - 0.5) * spread) * v;
    const vy = (c.dir.y + (Math.random() - 0.5) * spread) * v;
    const vz = (c.dir.z + (Math.random() - 0.5) * spread) * v;
    const col = randomPaletteColor();
    const ps = this.sparks;
    const i = ps.spawn(c.origin.x, c.origin.y, c.origin.z, vx, vy, vz,
      c.def.duration * rnd(0.9, 1.1), STAR_SIZE * s * 2.4, col[0], col[1], col[2],
      c.def.drag, g, F_HOLD);
    ps.setTrail(i, 70, 0.35, col[0] * 0.9, col[1] * 0.9, col[2] * 0.9);
    // Muzzle flash.
    if (!this.opts.reducedFlash) {
      ps.spawn(c.origin.x, c.origin.y, c.origin.z, 0, 0, 0, 0.15, STAR_SIZE * s * 8,
        1, 0.8, 0.5, 0, 0, F_HALO);
    }
    if (this.opts.smoke) {
      this.smoke.spawn(c.origin.x, c.origin.y, c.origin.z, c.dir.x * s, c.dir.y * 2 * s, c.dir.z * s,
        rnd(2, 3.5), 2.5 * s, 0.5, 0.5, 0.55, 1, -0.2 * s);
    }
    this.sound?.pop(this.volumeFor(c.dist, s));
    return false;
  }

  private updateFountain(f: Fountain, dt: number): boolean {
    f.t += dt;
    if (f.t >= f.dur) return true;
    const s = f.scale;
    const k = f.t / f.dur;
    // Ramp up, sustain, die down.
    const ramp = Math.min(1, f.t / 0.5) * Math.min(1, (f.dur - f.t) / 1.2);
    const rate = 420 * f.def.intensity * this.opts.amount * ramp * (0.85 + 0.15 * Math.sin(f.t * 9));
    f.acc += rate * dt;
    const g = f.def.gravity * s;
    const h = f.def.size * s * (0.85 + 0.3 * Math.sin(k * Math.PI));
    const v0 = Math.sqrt(2 * g * h);
    const up = f.up;
    // Basis around the fountain axis.
    const a = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = a.clone().cross(up).normalize();
    const t2 = up.clone().cross(t1).normalize();
    const ps = this.sparks;
    while (f.acc >= 1) {
      f.acc -= 1;
      const ang = Math.random() * Math.PI * 2;
      const cone = Math.random() * 0.32;
      const sinC = Math.sin(cone), cosC = Math.cos(cone);
      const dx = (t1.x * Math.cos(ang) + t2.x * Math.sin(ang)) * sinC + up.x * cosC;
      const dy = (t1.y * Math.cos(ang) + t2.y * Math.sin(ang)) * sinC + up.y * cosC;
      const dz = (t1.z * Math.cos(ang) + t2.z * Math.sin(ang)) * sinC + up.z * cosC;
      const sp = v0 * rnd(0.6, 1.05);
      const white = Math.random() < 0.3;
      const col = white ? f.c2 : f.c1;
      const i = ps.spawn(f.origin.x, f.origin.y, f.origin.z, dx * sp, dy * sp, dz * sp,
        f.def.duration * rnd(0.6, 1.1), STAR_SIZE * s * rnd(0.22, 0.4), col[0], col[1], col[2],
        f.def.drag, g, F_GLITTER);
      if (i < 0) { f.acc = 0; break; }
      if (Math.random() < 0.06) ps.setTrail(i, 30, 0.25, 1, 0.75, 0.4);
    }
    if (this.opts.smoke && Math.random() < dt * 6) {
      this.smoke.spawn(f.origin.x, f.origin.y, f.origin.z, up.x * s * 2, up.y * s * 2, up.z * s * 2,
        rnd(2.5, 4), f.def.size * s * 0.3, 0.5, 0.5, 0.55, 0.8, -0.3 * s);
    }
    return false;
  }

  // ------------------------------------------------------------------ bomb

  private bombGeo: THREE.SphereGeometry | null = null;
  private bombMat: THREE.MeshBasicMaterial | null = null;
  private fuseGeo: THREE.CylinderGeometry | null = null;
  private fuseMat: THREE.MeshBasicMaterial | null = null;

  /** A twine-wrapped "sutli" bomb with a fuse on top (~8 cm at 5 m). */
  private makeBombMesh(s: number, up: THREE.Vector3): THREE.Group {
    if (!this.bombGeo) {
      this.bombGeo = new THREE.SphereGeometry(1, 20, 14);
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d")!;
      for (let y = 0; y < 64; y += 4) {
        g.fillStyle = (y / 4) % 2 ? "#6b4423" : "#8a5a2e";
        g.fillRect(0, y, 64, 4);
      }
      g.fillStyle = "#b3201c";
      g.fillRect(0, 28, 64, 8); // red paper band
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.bombMat = new THREE.MeshBasicMaterial({ map: tex });
      this.fuseGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 6).translate(0, 0.5, 0);
      this.fuseMat = new THREE.MeshBasicMaterial({ color: 0xd9c38a });
    }
    const r = 0.8 * s;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(this.bombGeo, this.bombMat!);
    body.scale.setScalar(r);
    body.position.y = r * 0.9;
    const fuse = new THREE.Mesh(this.fuseGeo!, this.fuseMat!);
    fuse.position.y = r * 1.75;
    fuse.scale.set(r, r * 1.4, r);
    fuse.rotation.z = 0.35;
    grp.add(body, fuse);
    grp.userData.fuse = fuse;
    grp.userData.r = r;
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.clone().normalize());
    return grp;
  }

  private updateBomb(b: Bomb, dt: number): boolean {
    b.t += dt;
    if (b.t >= b.fuse) {
      this.blast(b);
      return true;
    }
    const s = b.scale;
    const ps = this.sparks;
    const r = b.mesh.userData.r as number;
    // The fuse burns down; its burning tip throws chingari (sparks).
    const left = 1 - b.t / b.fuse;
    b.fuseLine.scale.y = r * 1.4 * Math.max(0.05, left);
    b.mesh.updateMatrixWorld(true);
    const tip = new THREE.Vector3(0, 1, 0).applyMatrix4(b.fuseLine.matrixWorld);
    const urgency = b.t > b.fuse - 0.7 ? 2.2 : 1;
    b.acc += 110 * urgency * (0.5 + Math.random()) * this.opts.amount * dt;
    while (b.acc >= 1) {
      b.acc -= 1;
      const th = Math.random() * Math.PI * 2;
      const el = rnd(-0.2, 1);
      const sp = rnd(3, 11) * s * urgency;
      const dx = Math.cos(th) * Math.cos(el) + b.up.x * 0.4;
      const dy = Math.sin(el) + b.up.y * 0.4;
      const dz = Math.sin(th) * Math.cos(el) + b.up.z * 0.4;
      const white = Math.random() < 0.35;
      const i = ps.spawn(tip.x, tip.y, tip.z, dx * sp, dy * sp, dz * sp,
        rnd(0.2, 0.55), STAR_SIZE * s * rnd(0.15, 0.3),
        1, white ? 0.95 : 0.7, white ? 0.8 : 0.3, 3, 9.8 * s, F_GLITTER);
      if (i < 0) { b.acc = 0; break; }
    }
    // Glowing tip.
    ps.spawn(tip.x, tip.y, tip.z, 0, 0, 0, dt * 1.5, STAR_SIZE * s * 0.9, 1, 0.55, 0.2, 0, 0, F_HOLD);
    if (this.opts.smoke && Math.random() < dt * 5) {
      this.smoke.spawn(tip.x, tip.y, tip.z, 0, 0.6 * s, 0, rnd(1.5, 2.5), r * 3, 0.55, 0.55, 0.58, 1, -0.4 * s);
    }
    return false;
  }

  /** The bang: flash, shockwave, debris and smoke, then the firework. */
  private blast(b: Bomb): void {
    this.group.remove(b.mesh);
    const s = b.scale;
    const B = b.def.size * s; // blast radius
    const { x, y, z } = b.origin;
    const ps = this.sparks;
    const up = b.up;
    const rf = this.opts.reducedFlash;
    const cx = x + up.x * B * 0.08, cy = y + up.y * B * 0.08, cz = z + up.z * B * 0.08;

    ps.spawn(cx, cy, cz, 0, 0, 0, rf ? 0.2 : 0.35, B * (rf ? 0.8 : 2.4), 1, 0.92, 0.75, 0, 0, F_HALO);
    ps.spawn(cx, cy, cz, 0, 0, 0, rf ? 0.4 : 0.8, B * (rf ? 0.6 : 1.4), 1, 0.5, 0.15, 0, 0, F_HALO);

    // Debris: a dome of hot sparks, some crackling afterwards.
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    const v = new THREE.Vector3();
    const n = Math.round(220 * this.opts.amount);
    const v0 = B * b.def.drag;
    for (let k = 0; k < n; k++) {
      const th = Math.random() * Math.PI * 2;
      const el = Math.asin(rnd(0.05, 1));
      v.set(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)).applyQuaternion(q);
      const sp = v0 * rnd(0.3, 1.1);
      const hot = Math.random();
      const col: RGB = hot < 0.3 ? [1, 1, 0.9] : hot < 0.7 ? [1, 0.75, 0.3] : [1, 0.45, 0.12];
      ps.spawn(cx, cy, cz, v.x * sp, v.y * sp, v.z * sp, rnd(0.4, 1.1), STAR_SIZE * s * rnd(0.3, 0.6),
        col[0], col[1], col[2], b.def.drag, b.def.gravity * s, Math.random() < 0.3 ? F_CRACKLE : 0);
    }
    // Shockwave: a fast flat ring along the ground.
    const t1 = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const t2 = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const ring = Math.round(70 * this.opts.amount);
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const sp = v0 * 1.4;
      const ca = Math.cos(a), sa = Math.sin(a);
      ps.spawn(x, y, z, (t1.x * ca + t2.x * sa) * sp, (t1.y * ca + t2.y * sa) * sp, (t1.z * ca + t2.z * sa) * sp,
        rnd(0.25, 0.4), STAR_SIZE * s * 0.4, 1, 0.85, 0.6, 4, 0, 0);
    }
    if (this.opts.smoke) {
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = B * rnd(0.4, 1.4);
        const ca = Math.cos(a), sa = Math.sin(a);
        this.smoke.spawn(cx, cy, cz,
          (t1.x * ca + t2.x * sa + up.x * 0.6) * sp,
          (t1.y * ca + t2.y * sa + up.y * 0.6) * sp,
          (t1.z * ca + t2.z * sa + up.z * 0.6) * sp,
          rnd(4, 7), B * rnd(0.5, 0.9), 0.5, 0.5, 0.53, 1.4, -0.25 * s);
      }
    }
    const vol = this.volumeFor(b.dist, s);
    this.sound?.blast(Math.min(1, vol * 1.3));
    this.schedule(0.35, () => this.sound?.crackle(8, vol));

    // ...then the firework shoots up from the blast spot.
    const follow = b.plan.follow;
    if (follow) {
      this.schedule(0.7, () => {
        const [c1, c2] = resolveColors(follow);
        const fs = b.plan.followScale ?? s;
        const rise = b.origin.distanceTo(b.plan.target);
        this.entities.push({
          type: "rocket", def: follow, comet: false, c1, c2, basis: b.plan.basis, scale: fs,
          start: b.origin.clone(), target: b.plan.target.clone(), t: 0,
          dur: THREE.MathUtils.clamp((rise / (55 * Math.max(fs, 0.05))) * 1.4, 0.9, 2.0),
          dist: b.dist,
        });
        this.sound?.launch(vol * 0.6, true);
      });
    }
  }

  clear(): void {
    for (const e of this.entities) if (e.type === "bomb") this.group.remove(e.mesh);
    this.entities = [];
    this.scheduled = [];
    this.sparks.clear();
    this.smoke.clear();
  }

  dispose(): void {
    this.clear();
    this.sparks.dispose();
    this.bombGeo?.dispose();
    this.bombMat?.map?.dispose();
    this.bombMat?.dispose();
    this.fuseGeo?.dispose();
    this.fuseMat?.dispose();
    this.smoke.dispose();
  }
}

/**
 * Viewer-facing basis for planar shapes (hearts, stars…). Kept upright
 * relative to the world so a tilted phone still shows an upright heart.
 */
export function basisFromCamera(cam: THREE.Camera): Basis {
  const m = cam.matrixWorld.elements;
  const fwd = new THREE.Vector3(-m[8], -m[9], -m[10]).normalize();
  let right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-4) right.set(m[0], m[1], m[2]);
  right = right.normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const v = (a: THREE.Vector3): Vec3 => [a.x, a.y, a.z];
  return { right: v(right), up: v(up), fwd: v(fwd) };
}
