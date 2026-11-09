import * as THREE from "three";

type IOSOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/**
 * Camera-overlay AR (the universal fallback). Uses the device's orientation
 * sensors to rotate the virtual camera with the phone (3-DoF), so fireworks
 * stay put in the sky while you pan. Without sensors the virtual camera is
 * fixed and effects are camera-relative.
 */
export class OverlayManager {
  /** True once real orientation events have been received. */
  tracking = false;
  enabled = true;
  onChange: (tracking: boolean) => void = () => {};

  private target = new THREE.Quaternion();
  private yawOffset = new THREE.Quaternion();
  private needsRecenter = true;
  private listening = false;
  private lastEvent = 0;
  private euler = new THREE.Euler();
  private q0 = new THREE.Quaternion();
  private readonly q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  private readonly zee = new THREE.Vector3(0, 0, 1);

  static get needsPermission(): boolean {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return false;
    return typeof (DeviceOrientationEvent as IOSOrientationEvent).requestPermission === "function";
  }

  static get supported(): boolean {
    return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  }

  /** iOS: must be called from a user gesture. Elsewhere resolves immediately. */
  async requestPermission(): Promise<boolean> {
    if (!OverlayManager.supported) return false;
    const E = DeviceOrientationEvent as IOSOrientationEvent;
    if (typeof E.requestPermission === "function") {
      try {
        return (await E.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
    return true;
  }

  start(): void {
    if (this.listening || !OverlayManager.supported) return;
    window.addEventListener("deviceorientation", this.onOrientation);
    this.listening = true;
  }

  stop(): void {
    window.removeEventListener("deviceorientation", this.onOrientation);
    this.listening = false;
    this.setTracking(false);
  }

  /** Make the current heading the "forward" direction again. */
  recenter(): void {
    this.needsRecenter = true;
  }

  private setTracking(t: boolean) {
    if (t !== this.tracking) {
      this.tracking = t;
      this.onChange(t);
    }
  }

  private onOrientation = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const deg = THREE.MathUtils.DEG2RAD;
    const orient = ((screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation) || 0) * deg;
    this.euler.set(e.beta * deg, e.alpha * deg, -e.gamma * deg, "YXZ");
    const q = new THREE.Quaternion().setFromEuler(this.euler);
    q.multiply(this.q1);
    q.multiply(this.q0.setFromAxisAngle(this.zee, -orient));

    if (this.needsRecenter) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const heading = Math.atan2(-fwd.x, -fwd.z);
      this.yawOffset.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading);
      this.needsRecenter = false;
    }
    this.target.copy(this.yawOffset).multiply(q);
    this.lastEvent = performance.now();
    this.setTracking(true);
  };

  /** Apply the (smoothed) device orientation to the camera. */
  apply(camera: THREE.Camera, dt: number): void {
    if (this.tracking && performance.now() - this.lastEvent > 1500) this.setTracking(false);
    const goal = this.enabled && this.tracking ? this.target : IDENTITY;
    const k = 1 - Math.exp(-dt * 18);
    camera.quaternion.slerp(goal, k);
    camera.updateMatrixWorld();
  }
}

const IDENTITY = new THREE.Quaternion();
