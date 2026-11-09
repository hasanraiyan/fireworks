import * as THREE from "three";

export interface XRHit {
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Progressive enhancement: a WebXR `immersive-ar` session with hit-testing
 * for real surface placement (Android Chrome with ARCore, some headsets).
 * Everything here is optional; the overlay mode works without it.
 */
export class WebXRManager {
  session: XRSession | null = null;
  readonly reticle: THREE.Mesh;
  /** Latest centre-screen surface hit. */
  centerHit: XRHit | null = null;
  onEnd: () => void = () => {};
  onSelect: (ray: THREE.Ray, hit: XRHit | null) => void = () => {};

  private renderer: THREE.WebGLRenderer | null = null;
  private hitSource: XRHitTestSource | null = null;
  private transientSource: XRTransientInputHitTestSource | null = null;
  private pendingSelects: XRInputSource[] = [];
  private tmpMat = new THREE.Matrix4();

  constructor() {
    const geo = new THREE.RingGeometry(0.06, 0.08, 40).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.85 });
    this.reticle = new THREE.Mesh(geo, mat);
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
  }

  static async isSupported(): Promise<boolean> {
    try {
      const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
      return !!xr && (await xr.isSessionSupported("immersive-ar"));
    } catch {
      return false;
    }
  }

  get active(): boolean {
    return !!this.session;
  }

  async start(renderer: THREE.WebGLRenderer, overlayRoot: HTMLElement): Promise<void> {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) throw new Error("WebXR unavailable");
    const session = await xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "local-floor"],
      domOverlay: { root: overlayRoot },
    } as XRSessionInit);
    this.session = session;
    this.renderer = renderer;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);

    const viewer = await session.requestReferenceSpace("viewer");
    this.hitSource = (await session.requestHitTestSource?.({ space: viewer })) ?? null;
    try {
      this.transientSource =
        (await session.requestHitTestSourceForTransientInput?.({ profile: "generic-touchscreen" })) ?? null;
    } catch {
      this.transientSource = null;
    }

    session.addEventListener("select", (e) => this.pendingSelects.push((e as XRInputSourceEvent).inputSource));
    session.addEventListener("end", () => this.cleanup());
  }

  /** Call once per XR frame (before rendering). */
  update(): void {
    const renderer = this.renderer;
    const frame = renderer?.xr.getFrame();
    const ref = renderer?.xr.getReferenceSpace();
    if (!renderer || !frame || !ref) return;

    this.centerHit = null;
    if (this.hitSource) {
      const results = frame.getHitTestResults(this.hitSource);
      const pose = results[0]?.getPose(ref);
      if (pose) this.centerHit = this.poseToHit(pose.transform.matrix);
    }
    this.reticle.visible = !!this.centerHit;
    if (this.centerHit) this.reticle.matrix.fromArray(this.tmpMat.toArray());

    // Resolve taps that arrived since the last frame.
    if (this.pendingSelects.length) {
      const selects = this.pendingSelects;
      this.pendingSelects = [];
      const transient = this.transientSource ? frame.getHitTestResultsForTransientInput(this.transientSource) : [];
      for (const src of selects) {
        const rayPose = frame.getPose(src.targetRaySpace, ref);
        if (!rayPose) continue;
        const m = new THREE.Matrix4().fromArray(rayPose.transform.matrix);
        const origin = new THREE.Vector3().setFromMatrixPosition(m);
        const dir = new THREE.Vector3(0, 0, -1).transformDirection(m);
        let hit: XRHit | null = null;
        const tr = transient.find((t) => t.inputSource === src);
        const tPose = tr?.results[0]?.getPose(ref);
        if (tPose) hit = this.poseToHit(tPose.transform.matrix);
        else hit = this.centerHit;
        this.onSelect(new THREE.Ray(origin, dir), hit);
      }
    }
  }

  private poseToHit(matrix: Float32Array): XRHit {
    this.tmpMat.fromArray(matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(this.tmpMat);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(this.tmpMat);
    return { position, normal };
  }

  async end(): Promise<void> {
    try {
      await this.session?.end();
    } catch {
      this.cleanup();
    }
  }

  private cleanup(): void {
    this.hitSource?.cancel();
    this.transientSource?.cancel();
    this.hitSource = null;
    this.transientSource = null;
    this.session = null;
    this.centerHit = null;
    this.reticle.visible = false;
    if (this.renderer) this.renderer.xr.enabled = false;
    this.onEnd();
  }
}
