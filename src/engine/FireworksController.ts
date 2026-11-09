import * as THREE from "three";
import type { FireworkDefinition, Mode } from "@/types";
import { FIREWORKS, RANDOMIZABLE, RANDOM_ID, getFirework } from "@/config/fireworks";
import { FireworksEngine, basisFromCamera, type LaunchPlan } from "./FireworksEngine";
import type { XRHit } from "@/ar/WebXRManager";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
/** Assumed height of the phone above the ground in overlay mode (metres). */
const EYE_HEIGHT = 1.5;

/**
 * Turns user intent (a tap at a screen point, a key press, "finale") into
 * concrete launch plans for the engine, according to mode and effect kind.
 */
export class FireworksController {
  mode: Mode = "sky";
  selectedId: string = "peony";
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), EYE_HEIGHT);

  constructor(private engine: FireworksEngine, private camera: () => THREE.Camera) {}

  private pick(): FireworkDefinition {
    if (this.selectedId === RANDOM_ID) {
      const id = RANDOMIZABLE[(Math.random() * RANDOMIZABLE.length) | 0];
      return getFirework(id)!;
    }
    return getFirework(this.selectedId) ?? FIREWORKS[0];
  }

  /** Launch at a normalised device coordinate (-1..1). Returns false if throttled. */
  launchAtScreen(ndcX: number, ndcY: number, override?: FireworkDefinition): boolean {
    const cam = this.camera();
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    return this.launchAlongRay(this.raycaster.ray, null, override);
  }

  /** Launch along a world-space ray, optionally with a real surface hit (WebXR). */
  launchAlongRay(ray: THREE.Ray, hit: XRHit | null, override?: FireworkDefinition): boolean {
    const def = override ?? this.pick();
    if (def.kind === "finale") {
      this.finale();
      return true;
    }
    if (def.kind === "bomb") return this.engine.launch(def, this.bombPlan(def, ray, hit));
    const plan = this.mode === "sky" ? this.skyPlan(def, ray) : this.worldPlan(def, ray, hit);
    return this.engine.launch(def, plan);
  }

  /**
   * A bomb always sits on the ground (in both modes). Tapping above the
   * horizon places it on the ground in that direction.
   */
  private bombPlan(def: FireworkDefinition, ray: THREE.Ray, hit: XRHit | null): LaunchPlan {
    const basis = basisFromCamera(this.camera());
    let point: THREE.Vector3;
    let up = UP.clone();
    if (hit && Math.abs(hit.normal.y) > 0.6) {
      point = hit.position.clone();
      up = hit.normal.clone();
    } else {
      const g = ray.intersectPlane(this.ground, new THREE.Vector3());
      if (g && g.distanceTo(ray.origin) < 30) point = g;
      else {
        const flat = new THREE.Vector3(ray.direction.x, 0, ray.direction.z);
        if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
        flat.normalize().multiplyScalar(14);
        point = ray.origin.clone().add(flat);
        point.y = ray.origin.y - EYE_HEIGHT;
      }
    }
    const d = Math.max(0.5, point.distanceTo(ray.origin));
    const scale = THREE.MathUtils.clamp(d / 50, 0.03, 0.8);

    // The firework that follows the blast.
    const followId = def.follow ?? "random";
    const follow =
      followId === "random"
        ? getFirework(RANDOMIZABLE[(Math.random() * RANDOMIZABLE.length) | 0])!
        : getFirework(followId) ?? FIREWORKS[0];
    // It climbs well above the bomb so it reads as a sky burst.
    const fScale = scale * 1.6;
    const target = point.clone().addScaledVector(UP, follow.size * fScale * 1.6 + 1);
    return { origin: point, target, up, scale, basis, distance: d, follow, followScale: fScale };
  }

  private skyPlan(def: FireworkDefinition, ray: THREE.Ray): LaunchPlan {
    const cam = this.camera();
    const basis = basisFromCamera(cam);
    const camPos = ray.origin;

    if (def.kind === "fountain") {
      const D = rnd(30, 40);
      const p = ray.at(D, new THREE.Vector3());
      const scale = D / 25;
      // Base the fountain slightly below the tapped point so the spray covers it.
      p.y -= def.size * scale * 0.4;
      return { origin: p, target: p.clone(), up: UP.clone(), scale, basis, distance: D };
    }

    // Varying launch heights / burst distances.
    const D = rnd(80, 125);
    const target = ray.at(D, new THREE.Vector3());
    const scale = (D / 100) * rnd(0.85, 1.15);

    if (def.kind === "candle") {
      const rise = 45 * scale;
      const origin = target.clone().add(new THREE.Vector3(rnd(-3, 3), -rise, rnd(-3, 3)));
      return { origin, target, up: UP.clone(), scale: scale * 0.7, basis, distance: D };
    }

    // Shells & comets: rocket climbs from well below the burst point.
    const rise = rnd(45, 65) * scale;
    const origin = target.clone().add(new THREE.Vector3(rnd(-4, 4) * scale, -rise, rnd(-4, 4) * scale));
    return { origin, target, up: UP.clone(), scale, basis, distance: target.distanceTo(camPos) };
  }

  private worldPlan(def: FireworkDefinition, ray: THREE.Ray, hit: XRHit | null): LaunchPlan {
    const cam = this.camera();
    const basis = basisFromCamera(cam);
    let point: THREE.Vector3;
    let normal: THREE.Vector3;

    if (hit) {
      point = hit.position.clone();
      normal = hit.normal.clone();
    } else {
      // Fallback placement: virtual ground plane, else a virtual wall.
      const g = ray.intersectPlane(this.ground, new THREE.Vector3());
      if (g && g.distanceTo(ray.origin) < 40) {
        point = g;
        normal = UP.clone();
      } else {
        point = ray.at(10, new THREE.Vector3());
        normal = ray.direction.clone().negate();
        normal.y = 0;
        if (normal.lengthSq() < 1e-4) normal.set(0, 0, 1);
        normal.normalize();
      }
    }

    const d = Math.max(0.5, point.distanceTo(ray.origin));
    const scale = THREE.MathUtils.clamp(d / 50, 0.03, 0.8) * rnd(0.9, 1.1);
    const isWall = Math.abs(normal.y) < 0.6;

    if (def.kind === "fountain") {
      // On a wall, spray mostly upward with a slight lean away from the surface.
      const up = isWall ? normal.clone().multiplyScalar(0.35).add(UP).normalize() : normal.clone();
      // World fountains are a bit bigger relative to distance (ground-level effect).
      return { origin: point, target: point.clone(), up, scale: scale * 2.2, basis, distance: d };
    }

    const R = def.size * scale;
    const h = def.kind === "candle" ? R * 2.4 : R * 1.4 + 0.3;
    const target = point.clone().addScaledVector(UP, h);
    if (isWall) target.addScaledVector(normal, R * 0.6);
    return { origin: point, target, up: UP.clone(), scale, basis, distance: d };
  }

  /** Grand finale: a rolling barrage followed by a simultaneous volley. */
  finale(): void {
    const shells = RANDOMIZABLE.map((id) => getFirework(id)!).filter((d) => d.shape !== "strobe");
    const n = 22;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 6 + rnd(0, 0.25);
      this.engine.schedule(t, () => {
        const def = shells[(Math.random() * shells.length) | 0];
        this.launchFinaleShot(def);
      });
    }
    if (this.mode === "world") {
      const fountain = getFirework("fountain");
      if (fountain) {
        for (let i = 0; i < 4; i++) {
          this.engine.schedule(i * 0.3, () => {
            this.raycaster.setFromCamera(new THREE.Vector2(-0.6 + i * 0.4, -0.75), this.camera());
            this.engine.launch({ ...fountain, emitDuration: 8 }, this.worldPlan(fountain, this.raycaster.ray, null));
          });
        }
      }
    }
    const peony = getFirework("peony")!;
    const multi = getFirework("multicolor")!;
    for (let i = 0; i < 6; i++) {
      this.engine.schedule(6.6 + i * 0.07, () => this.launchFinaleShot(i % 2 ? peony : multi));
    }
  }

  private launchFinaleShot(def: FireworkDefinition): void {
    const x = rnd(-0.8, 0.8);
    const y = this.mode === "sky" ? rnd(0.0, 0.75) : rnd(0.1, 0.7);
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera());
    // Finale shells always go up into the sky, even in World mode.
    this.engine.launch(def, this.skyPlan(def, this.raycaster.ray));
  }
}
