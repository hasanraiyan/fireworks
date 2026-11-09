/**
 * Composites the live camera frame and the WebGL fireworks layer into one
 * 2D canvas — exactly what the user sees, minus the UI controls. Must be
 * called right after the WebGL render in the same frame (the GL canvas does
 * not preserve its drawing buffer).
 */
export interface ComposeSource {
  video: HTMLVideoElement | null;
  gl: HTMLCanvasElement;
  /** Mirror the camera image (front camera). */
  mirror: boolean;
  /** CSS size of the on-screen viewport. */
  viewW: number;
  viewH: number;
}

export function composeFrame(ctx: CanvasRenderingContext2D, src: ComposeSource): void {
  const { width: W, height: H } = ctx.canvas;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  const v = src.video;
  if (v && v.readyState >= 2 && v.videoWidth > 0) {
    // object-fit: cover
    const s = Math.max(W / v.videoWidth, H / v.videoHeight);
    const dw = v.videoWidth * s;
    const dh = v.videoHeight * s;
    if (src.mirror) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    drawNightSky(ctx, W, H);
  }
  // Fireworks are additive light: add them on top of the camera image.
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(src.gl, 0, 0, W, H);
  ctx.restore();
}

/** Same gradient as the CSS demo background, for camera-less captures. */
export function drawNightSky(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#03040c");
  g.addColorStop(0.6, "#0b1030");
  g.addColorStop(1, "#1a1530");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Output size matching the viewport aspect, with the long side capped. */
export function outputSize(viewW: number, viewH: number, longSide: number): { w: number; h: number } {
  const aspect = viewW / viewH;
  let w: number, h: number;
  if (aspect >= 1) {
    w = longSide;
    h = Math.round(longSide / aspect);
  } else {
    h = longSide;
    w = Math.round(longSide * aspect);
  }
  // Even dimensions keep video encoders happy.
  return { w: w - (w % 2), h: h - (h % 2) };
}
