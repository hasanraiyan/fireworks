import * as THREE from "three";
import { qualityLadder, type QualityProfile } from "@/config/settings";
import type { QualityLevel } from "@/types";

/**
 * Three.js renderer for the fireworks layer. The canvas is transparent and
 * sits over the live <video>; the virtual camera's field of view is matched
 * to the real camera so placements line up with the scene.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 2000);
  readonly canvas: HTMLCanvasElement;

  private ladder: QualityProfile[] = qualityLadder();
  private level = 0;
  quality: QualityLevel = "auto";
  onQualityChange: (p: QualityProfile) => void = () => {};

  // FPS monitor for adaptive quality
  private frameTimes: number[] = [];
  private lastAdjust = 0;

  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = true;
    this.scene.add(this.camera);
  }

  get profile(): QualityProfile {
    return this.ladder[this.level];
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    this.level = q === "high" ? 0 : q === "medium" ? 1 : q === "low" ? 2 : Math.min(this.level, 1);
    this.applyProfile();
  }

  private applyProfile() {
    this.renderer.setPixelRatio(this.profile.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.onQualityChange(this.profile);
  }

  /**
   * Resize and match the real camera's FOV. Phone/webcam main cameras have
   * roughly a 66° field of view across their long side; with object-fit
   * "cover" the visible portion is a crop of that.
   */
  resize(width: number, height: number, videoW = 0, videoH = 0): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    let fov = 60;
    if (videoW > 0 && videoH > 0) {
      const longSide = Math.max(videoW, videoH);
      const focal = longSide / 2 / Math.tan(THREE.MathUtils.degToRad(33));
      const cover = Math.max(this.width / videoW, this.height / videoH);
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(this.height / 2 / (focal * cover)));
    } else {
      // No camera (demo sky): a comfortable vertical FOV for the orientation.
      fov = this.width > this.height ? 45 : 58;
    }
    this.camera.fov = THREE.MathUtils.clamp(fov, 25, 100);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
  }

  /** Half the drawing-buffer height in pixels (for point size attenuation). */
  get pixelScale(): number {
    if (this.renderer.xr.isPresenting) {
      const layer = this.renderer.xr.getSession()?.renderState.baseLayer;
      return (layer?.framebufferHeight ?? this.height) / 2;
    }
    return (this.height * this.renderer.getPixelRatio()) / 2;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Feed frame durations; steps quality down/up when on "auto". */
  sampleFrame(dt: number, now: number): void {
    if (this.quality !== "auto" || this.renderer.xr.isPresenting) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (now - this.lastAdjust < 2500 || this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = 1 / avg;
    if (fps < 40 && this.level < this.ladder.length - 1) {
      this.level++;
      this.lastAdjust = now;
      this.frameTimes = [];
      this.applyProfile();
    } else if (fps > 57 && this.level > 0 && now - this.lastAdjust > 8000) {
      this.level--;
      this.lastAdjust = now;
      this.frameTimes = [];
      this.applyProfile();
    }
  }

  /** Called when the GPU context is lost/restored. */
  onContextLost(cb: () => void, restored: () => void): () => void {
    const lost = (e: Event) => {
      e.preventDefault();
      cb();
    };
    this.canvas.addEventListener("webglcontextlost", lost);
    this.canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      this.canvas.removeEventListener("webglcontextlost", lost);
      this.canvas.removeEventListener("webglcontextrestored", restored);
    };
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
