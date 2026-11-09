import type { CapturedMedia } from "@/types";
import { composeFrame, outputSize, type ComposeSource } from "./Compositor";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Capture the current camera + fireworks frame as a JPEG. Call immediately
 * after rendering (inside the animation loop).
 */
export function capturePhoto(src: ComposeSource): Promise<CapturedMedia> {
  const v = src.video;
  const videoLong = v && v.videoWidth ? Math.max(v.videoWidth, v.videoHeight) : 0;
  const screenLong = Math.max(src.viewW, src.viewH) * (window.devicePixelRatio || 1);
  const long = Math.min(2560, Math.max(1280, videoLong, screenLong));
  const { w, h } = outputSize(src.viewW, src.viewH, long);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas 2D unavailable"));
  composeFrame(ctx, src);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Could not encode image"));
        resolve({
          kind: "photo",
          blob,
          url: URL.createObjectURL(blob),
          filename: `fireworks-ar-${stamp()}.jpg`,
        });
      },
      "image/jpeg",
      0.92,
    );
  });
}

export { stamp };
