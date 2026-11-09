
import type { CameraStatus, CapturedMedia, Mode, Settings } from "@/types";
import { Renderer, webglAvailable } from "./Renderer";
import { FireworksEngine } from "./FireworksEngine";
import { FireworksController } from "./FireworksController";
import { CameraManager } from "@/camera/CameraManager";
import { ARManager } from "@/ar/ARManager";
import { SoundEngine } from "@/audio/SoundEngine";
import { capturePhoto } from "@/capture/PhotoCapture";
import { VideoRecorder, recordingSupported } from "@/capture/VideoRecorder";
import type { ComposeSource } from "@/capture/Compositor";
import { INTENSITY_FACTOR, qualityLadder } from "@/config/settings";

export interface ExperienceState {
  camera: CameraStatus;
  webgl: boolean;
  arMode: "overlay" | "webxr";
  xrSupported: boolean;
  tracking: boolean;
  torchSupported: boolean;
  torchOn: boolean;
  multipleCameras: boolean;
  facing: "environment" | "user";
  recordingSupported: boolean;
  recording: boolean;
  recordSeconds: number;
  qualityLevel: number;
  throttled: number; // increments when a launch was refused (budget)
}

interface Held {
  x: number;
  y: number;
  downAt: number;
  lastFire: number;
}

const LONG_PRESS_MS = 380;
const REPEAT_MS = 230;

/**
 * Orchestrates every subsystem behind a small imperative API that the React
 * UI drives. Owns the single animation loop.
 */
export class Experience {
  readonly camera: CameraManager;
  readonly ar = new ARManager();
  readonly sound = new SoundEngine();
  private renderer: Renderer;
  private engine: FireworksEngine;
  readonly controller: FireworksController;
  private recorder: VideoRecorder | null = null;
  private held = new Map<number, Held>();
  private settings!: Settings;
  private lastTime = 0;
  private running = false;
  private photoRequest: ((m: Promise<CapturedMedia>) => void) | null = null;
  private disposers: (() => void)[] = [];
  private lastRecordTick = -1;

  state: ExperienceState;
  onState: (s: ExperienceState) => void = () => {};
  onToast: (msg: string) => void = () => {};
  onRecordingSaved: (m: CapturedMedia | null) => void = () => {};

  constructor(
    private video: HTMLVideoElement,
    private canvas: HTMLCanvasElement,
    private overlayRoot: HTMLElement,
  ) {
    this.state = {
      camera: "idle",
      webgl: webglAvailable(),
      arMode: "overlay",
      xrSupported: false,
      tracking: false,
      torchSupported: false,
      torchOn: false,
      multipleCameras: false,
      facing: "environment",
      recordingSupported: recordingSupported(),
      recording: false,
      recordSeconds: 0,
      qualityLevel: 0,
      throttled: 0,
    };
    this.camera = new CameraManager(video);
    this.renderer = new Renderer(canvas);
    this.engine = new FireworksEngine(qualityLadder()[0].maxParticles);
    this.engine.sound = this.sound;
    this.renderer.scene.add(this.engine.group);
    this.renderer.scene.add(this.ar.xr.reticle);
    this.controller = new FireworksController(this.engine, () =>
      this.renderer.renderer.xr.isPresenting ? this.renderer.renderer.xr.getCamera() : this.renderer.camera,
    );

    this.camera.onStatus = (s) => {
      this.patch({
        camera: s,
        torchSupported: this.camera.torchSupported,
        torchOn: this.camera.torch,
        facing: this.camera.facing,
      });
      if (s === "active") {
        this.resize();
        void this.camera.hasMultipleCameras().then((m) => this.patch({ multipleCameras: m }));
      }
      if (s === "interrupted") {
        this.onToast("Camera interrupted — reconnecting…");
        setTimeout(() => {
          if (this.camera.status === "interrupted" && document.visibilityState === "visible") {
            void this.camera.start();
          }
        }, 800);
      }
    };
    this.ar.onChange = () =>
      this.patch({ arMode: this.ar.mode, xrSupported: this.ar.xrSupported, tracking: this.ar.tracking });
    this.renderer.onQualityChange = (p) => {
      this.engine.setLimit(p.maxParticles);
      this.applyEngineOptions();
      this.patch({ qualityLevel: qualityLadder().findIndex((q) => q.maxParticles === p.maxParticles) });
    };

    const onResize = () => this.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const onVis = () => this.onVisibility();
    document.addEventListener("visibilitychange", onVis);
    const offCtx = this.renderer.onContextLost(
      () => {
        this.stopLoop();
        this.onToast("Graphics paused — recovering…");
      },
      () => {
        this.engine.clear();
        this.startLoop();
      },
    );
    this.disposers.push(
      () => window.removeEventListener("resize", onResize),
      () => window.removeEventListener("orientationchange", onResize),
      () => document.removeEventListener("visibilitychange", onVis),
      offCtx,
    );
    void this.ar.detect();
  }

  private patch(p: Partial<ExperienceState>) {
    this.state = { ...this.state, ...p };
    this.onState(this.state);
  }

  // ---------------------------------------------------------------- settings

  applySettings(s: Settings): void {
    const prev = this.settings;
    this.settings = s;
    this.sound.setMuted(!s.sound);
    if (!prev || prev.quality !== s.quality) this.renderer.setQuality(s.quality);
    this.applyEngineOptions();
    this.ar.startOverlay(s.tracking);
    if (prev && prev.facing !== s.facing && this.camera.active && this.camera.facing !== s.facing) {
      void this.camera.start(s.facing);
    }
  }

  private applyEngineOptions() {
    if (!this.settings) return;
    const s = this.settings;
    const p = this.renderer.profile;
    const qualityFactor = p.maxParticles >= 30000 ? 1 : p.maxParticles >= 18000 ? 0.8 : 0.55;
    this.engine.setOptions({
      amount: INTENSITY_FACTOR[s.intensity] * qualityFactor * (s.motion === "reduced" ? 0.6 : 1),
      reducedFlash: s.flash === "reduced",
      reducedMotion: s.motion === "reduced",
      smoke: p.smoke,
    });
  }

  setMode(m: Mode): void {
    this.controller.mode = m;
  }

  setSelected(id: string): void {
    this.controller.selectedId = id;
  }

  // ------------------------------------------------------------------ camera

  async startCamera(): Promise<void> {
    await this.camera.start(this.settings?.facing ?? "environment");
  }

  continueWithoutCamera(): void {
    this.camera.stop();
    this.patch({ camera: "none" });
    this.resize();
  }

  async switchCamera(): Promise<void> {
    await this.camera.switchCamera();
    this.patch({ facing: this.camera.facing });
  }

  async toggleTorch(): Promise<void> {
    const ok = await this.camera.setTorch(!this.camera.torch);
    if (!ok) this.onToast("Flash isn’t available on this camera");
    this.patch({ torchOn: this.camera.torch });
  }

  // -------------------------------------------------------------------- loop

  start(): void {
    this.resize();
    this.startLoop();
  }

  private startLoop() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private stopLoop() {
    this.running = false;
    this.renderer.renderer.setAnimationLoop(null);
  }

  private frame(now: number) {
    const dt = Math.min(0.1, Math.max(0.0005, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const r = this.renderer;

    this.ar.update(r.camera, dt);
    this.handleHeld(now);
    this.engine.pixelScale = r.pixelScale;
    this.engine.update(dt);
    r.render();

    // Capture must happen right after render, in the same task.
    if (this.photoRequest && !r.renderer.xr.isPresenting) {
      const resolve = this.photoRequest;
      this.photoRequest = null;
      resolve(capturePhoto(this.composeSource()));
    }
    if (this.recorder?.recording) {
      this.recorder.drawFrame(this.composeSource());
      const sec = Math.floor(this.recorder.elapsed);
      if (sec !== this.lastRecordTick) {
        this.lastRecordTick = sec;
        this.patch({ recordSeconds: sec });
      }
    }
    r.sampleFrame(dt, now);
  }

  private composeSource(): ComposeSource {
    const hasCam = this.camera.active;
    return {
      video: hasCam ? this.video : null,
      gl: this.canvas,
      mirror: hasCam && this.camera.facing === "user",
      viewW: this.renderer.width,
      viewH: this.renderer.height,
    };
  }

  resize(): void {
    const rect = this.overlayRoot.getBoundingClientRect();
    const w = rect.width || window.innerWidth;
    const h = rect.height || window.innerHeight;
    const hasCam = this.camera.active;
    this.renderer.resize(w, h, hasCam ? this.video.videoWidth : 0, hasCam ? this.video.videoHeight : 0);
  }

  private onVisibility(): void {
    if (document.visibilityState === "hidden") {
      // Save rather than lose an in-progress recording.
      if (this.recorder?.recording) void this.stopRecording();
      this.held.clear();
      this.stopLoop();
      this.sound.suspend();
    } else {
      this.sound.resume();
      this.startLoop();
      const s = this.camera.status;
      if ((s === "interrupted" || (s === "active" && !this.camera.active))) void this.camera.start();
      else if (s === "active" && this.video.paused) void this.video.play().catch(() => {});
    }
  }

  // ------------------------------------------------------------------- input

  private toNdc(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1];
  }

  /** First gesture unlocks audio and (on iOS) motion sensors. */
  private gesture(): void {
    this.sound.unlock();
    if (this.settings?.tracking) void this.ar.ensureMotionPermission();
  }

  pointerDown(id: number, clientX: number, clientY: number): void {
    this.gesture();
    if (this.renderer.renderer.xr.isPresenting) return; // XR taps arrive as "select"
    const now = performance.now();
    this.held.set(id, { x: clientX, y: clientY, downAt: now, lastFire: now });
    this.launchAt(clientX, clientY);
  }

  pointerMove(id: number, clientX: number, clientY: number): void {
    const h = this.held.get(id);
    if (h) {
      h.x = clientX;
      h.y = clientY;
    }
  }

  pointerUp(id: number): void {
    this.held.delete(id);
  }

  private handleHeld(now: number) {
    for (const h of this.held.values()) {
      if (now - h.downAt > LONG_PRESS_MS && now - h.lastFire > REPEAT_MS) {
        h.lastFire = now;
        const j = 18;
        this.launchAt(h.x + (Math.random() - 0.5) * j, h.y + (Math.random() - 0.5) * j);
      }
    }
  }

  private launchAt(clientX: number, clientY: number) {
    const [x, y] = this.toNdc(clientX, clientY);
    if (!this.controller.launchAtScreen(x, y)) this.patch({ throttled: this.state.throttled + 1 });
  }

  /** Keyboard / button launch at a random pleasant position. */
  launchRandomPosition(): void {
    this.gesture();
    const x = (Math.random() - 0.5) * 1.4;
    const y = this.controller.mode === "sky" ? 0.1 + Math.random() * 0.6 : -0.4 - Math.random() * 0.4;
    if (!this.controller.launchAtScreen(x, y)) this.patch({ throttled: this.state.throttled + 1 });
  }

  finale(): void {
    this.gesture();
    this.controller.finale();
  }

  // ----------------------------------------------------------------- capture

  takePhoto(): Promise<CapturedMedia> {
    if (this.renderer.renderer.xr.isPresenting) {
      return Promise.reject(new Error("Photos aren’t available during a WebXR session"));
    }
    return new Promise<CapturedMedia>((resolve, reject) => {
      this.photoRequest = (p) => p.then(resolve, reject);
      if (!this.running) {
        // Loop paused (shouldn't happen while visible) — render once.
        this.frame(performance.now());
      }
    });
  }

  startRecording(): void {
    this.gesture();
    if (!this.state.recordingSupported) throw new Error("Video recording isn’t supported in this browser");
    if (!this.recorder) {
      this.recorder = new VideoRecorder();
      this.recorder.onError = (m) => {
        this.onToast(m);
        this.patch({ recording: false, recordSeconds: 0 });
      };
      this.recorder.onAutoStop = (m) => {
        this.patch({ recording: false, recordSeconds: 0 });
        this.onToast("Maximum recording length reached");
        this.onRecordingSaved(m);
      };
    }
    this.recorder.start(
      this.renderer.width,
      this.renderer.height,
      this.settings?.recordingQuality ?? "auto",
      this.sound.recordingTrack(),
    );
    this.lastRecordTick = -1;
    this.patch({ recording: true, recordSeconds: 0 });
  }

  async stopRecording(): Promise<void> {
    const m = (await this.recorder?.stop()) ?? null;
    this.patch({ recording: false, recordSeconds: 0 });
    if (!m) this.onToast("Nothing was recorded");
    this.onRecordingSaved(m);
  }

  // ---------------------------------------------------------------------- XR

  async enterXR(): Promise<void> {
    this.gesture();
    if (this.recorder?.recording) await this.stopRecording();
    // Chrome cannot share the camera between getUserMedia and WebXR.
    const hadCamera = this.camera.active;
    this.camera.stop();
    this.engine.clear();
    try {
      await this.ar.enterXR(this.renderer.renderer, this.overlayRoot, (ray, hit) => {
        this.sound.unlock();
        if (!this.controller.launchAlongRay(ray, hit)) this.patch({ throttled: this.state.throttled + 1 });
      });
      this.ar.xr.onEnd = () => {
        this.engine.clear();
        this.ar.onChange();
        this.renderer.camera.quaternion.identity();
        this.resize();
        if (hadCamera) void this.startCamera();
      };
    } catch {
      this.onToast("AR tracking couldn’t start — using camera overlay");
      if (hadCamera) void this.startCamera();
    }
  }

  async exitXR(): Promise<void> {
    await this.ar.exitXR();
  }

  /** Stop everything that uses the camera (close button / unmount). */
  close(): void {
    if (this.recorder?.recording) void this.stopRecording();
    if (this.ar.xr.active) void this.ar.exitXR();
    this.camera.stop();
    this.engine.clear();
  }

  dispose(): void {
    this.close();
    this.stopLoop();
    this.disposers.forEach((d) => d());
    this.ar.dispose();
    this.engine.dispose();
    this.renderer.dispose();
    this.sound.dispose();
  }
}

