import * as THREE from "three";
import { OverlayManager } from "./OverlayManager";
import { WebXRManager, type XRHit } from "./WebXRManager";

export type ARMode = "overlay" | "webxr";

/**
 * Chooses between camera-overlay AR (universal) and WebXR (progressive
 * enhancement) and exposes one interface to the rest of the app.
 */
export class ARManager {
  readonly overlay = new OverlayManager();
  readonly xr = new WebXRManager();
  xrSupported = false;
  onChange: () => void = () => {};

  constructor() {
    this.overlay.onChange = () => this.onChange();
    this.xr.onEnd = () => this.onChange();
  }

  get mode(): ARMode {
    return this.xr.active ? "webxr" : "overlay";
  }

  /** Is the virtual camera following the device (gyro or XR)? */
  get tracking(): boolean {
    return this.xr.active || this.overlay.tracking;
  }

  async detect(): Promise<void> {
    this.xrSupported = await WebXRManager.isSupported();
    this.onChange();
  }

  startOverlay(enabled: boolean): void {
    this.overlay.enabled = enabled;
    if (enabled) this.overlay.start();
    else this.overlay.stop();
  }

  /** iOS motion permission must be requested from a user gesture. */
  async ensureMotionPermission(): Promise<boolean> {
    if (!OverlayManager.needsPermission) return true;
    const ok = await this.overlay.requestPermission();
    if (ok) this.overlay.start();
    return ok;
  }

  async enterXR(renderer: THREE.WebGLRenderer, root: HTMLElement, onSelect: (ray: THREE.Ray, hit: XRHit | null) => void): Promise<void> {
    this.xr.onSelect = onSelect;
    await this.xr.start(renderer, root);
    this.onChange();
  }

  async exitXR(): Promise<void> {
    await this.xr.end();
  }

  /** Per-frame update. */
  update(camera: THREE.Camera, dt: number): void {
    if (this.xr.active) this.xr.update();
    else this.overlay.apply(camera, dt);
  }

  dispose(): void {
    this.overlay.stop();
    void this.xr.end();
  }
}
