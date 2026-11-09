import type { CapturedMedia, Settings } from "@/types";
import { composeFrame, outputSize, type ComposeSource } from "./Compositor";
import { stamp } from "./PhotoCapture";

const CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function recordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickMime() !== null
  );
}

export function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Hard cap so a forgotten recording cannot fill the device. */
export const MAX_RECORDING_SECONDS = 180;

/**
 * Camera Video + Fireworks Canvas → Composite Canvas → captureStream()
 * → MediaRecorder → Blob (downloaded locally, never uploaded).
 */
export class VideoRecorder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = "";
  private startedAt = 0;
  private resolveStop: ((m: CapturedMedia | null) => void) | null = null;
  onError: (msg: string) => void = () => {};
  onAutoStop: (m: CapturedMedia | null) => void = () => {};

  constructor() {
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
  }

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  get elapsed(): number {
    return this.recording ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  start(viewW: number, viewH: number, quality: Settings["recordingQuality"], audio: MediaStreamTrack | null): void {
    const mime = pickMime();
    if (!mime) throw new Error("Recording is not supported in this browser");
    const mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
    const long = quality === "high" ? 1920 : quality === "standard" ? 1280 : mobile ? 1280 : 1920;
    const { w, h } = outputSize(viewW, viewH, long);
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, w, h);

    const stream = this.canvas.captureStream(30);
    if (audio) {
      try {
        stream.addTrack(audio.clone());
      } catch {
        /* video only */
      }
    }
    this.mime = mime;
    this.chunks = [];
    const bitrate = Math.round(w * h * 30 * 0.12);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    rec.onerror = () => {
      this.onError("Recording failed. Your device may be low on storage or memory.");
      this.finish();
    };
    rec.onstop = () => this.finish();
    rec.start(1000);
    this.recorder = rec;
    this.startedAt = performance.now();
  }

  /** Draw the current frame into the recording (call right after rendering). */
  drawFrame(src: ComposeSource): void {
    if (!this.recording) return;
    composeFrame(this.ctx, src);
    if (this.elapsed >= MAX_RECORDING_SECONDS) {
      void this.stop().then((m) => this.onAutoStop(m));
    }
  }

  stop(): Promise<CapturedMedia | null> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      this.resolveStop = resolve;
      try {
        rec.requestData();
      } catch {
        /* ignore */
      }
      rec.stop();
    });
  }

  private finish(): void {
    const rec = this.recorder;
    this.recorder = null;
    rec?.stream.getTracks().forEach((t) => t.stop());
    const resolve = this.resolveStop;
    this.resolveStop = null;
    if (!this.chunks.length) {
      resolve?.(null);
      return;
    }
    const type = this.mime.split(";")[0];
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const media: CapturedMedia = {
      kind: "video",
      blob,
      url: URL.createObjectURL(blob),
      filename: `fireworks-ar-${stamp()}.${ext}`,
    };
    if (resolve) resolve(media);
    else this.onAutoStop(media);
  }
}

/** Save to the device: share sheet on mobile (→ "Save to Photos"), else download. */
export async function saveMedia(media: CapturedMedia): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([media.blob], media.filename, { type: media.blob.type });
  const mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }
  const a = document.createElement("a");
  a.href = media.url;
  a.download = media.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "downloaded";
}
