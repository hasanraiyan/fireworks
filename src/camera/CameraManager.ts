import type { CameraStatus } from "@/types";
import { cameraSupported, classifyCameraError } from "./CameraPermissions";

type Facing = "environment" | "user";

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

/**
 * Owns the getUserMedia stream: start/stop, switching cameras, torch,
 * and recovery when the track ends unexpectedly. Frames never leave the
 * device — the stream is only attached to a local <video> element.
 */
export class CameraManager {
  readonly video: HTMLVideoElement;
  stream: MediaStream | null = null;
  facing: Facing = "environment";
  status: CameraStatus = "idle";
  onStatus: (s: CameraStatus) => void = () => {};
  private torchOn = false;
  private starting: Promise<void> | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
  }

  private setStatus(s: CameraStatus) {
    this.status = s;
    this.onStatus(s);
  }

  get active(): boolean {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === "live");
  }

  get track(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  async start(facing: Facing = this.facing): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = this.doStart(facing).finally(() => (this.starting = null));
    return this.starting;
  }

  private async doStart(facing: Facing): Promise<void> {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      this.setStatus("insecure");
      return;
    }
    if (!cameraSupported()) {
      this.setStatus("unavailable");
      return;
    }
    this.stopTracks();
    this.facing = facing;
    this.setStatus("requesting");
    const ideal = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, ...ideal },
      });
    } catch (err) {
      const status = classifyCameraError(err);
      if (status === "denied" || status === "insecure") {
        this.setStatus(status);
        return;
      }
      // Retry with the loosest constraints (some webcams reject sizes).
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      } catch (err2) {
        this.setStatus(classifyCameraError(err2));
        return;
      }
    }

    this.stream = stream;
    this.torchOn = false;
    const track = stream.getVideoTracks()[0];
    track?.addEventListener("ended", () => {
      // Device unplugged, another app grabbed it, OS interrupted, etc.
      if (this.stream === stream) this.setStatus("interrupted");
    });
    // Infer actual facing (desktop webcams report "user" or nothing).
    const settings = track?.getSettings?.();
    if (settings?.facingMode === "user" || settings?.facingMode === "environment") {
      this.facing = settings.facingMode;
    } else if (!/Android|iPhone|iPad|iPod/.test(navigator.userAgent)) {
      this.facing = "user";
    }

    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch {
      /* autoplay with muted+playsinline should succeed; a user tap will retry */
    }
    await waitForVideo(this.video);
    this.setStatus("active");
  }

  async hasMultipleCameras(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput").length > 1;
    } catch {
      return false;
    }
  }

  async switchCamera(): Promise<void> {
    const next: Facing = this.facing === "environment" ? "user" : "environment";
    await this.start(next);
  }

  get torchSupported(): boolean {
    const caps = this.track?.getCapabilities?.() as TorchCapabilities | undefined;
    return !!caps?.torch;
  }

  async setTorch(on: boolean): Promise<boolean> {
    const track = this.track;
    if (!track || !this.torchSupported) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      this.torchOn = on;
      return true;
    } catch {
      return false;
    }
  }

  get torch(): boolean {
    return this.torchOn;
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  /** Stop all media tracks (required when leaving the experience). */
  stop(): void {
    this.stopTracks();
    this.setStatus("stopped");
  }
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("loadeddata", done);
      resolve();
    };
    video.addEventListener("loadeddata", done);
    setTimeout(done, 3000);
  });
}
