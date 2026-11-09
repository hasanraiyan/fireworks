"use client";

import type { RefObject } from "react";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mirror: boolean;
  showVideo: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Full-screen live camera with the transparent fireworks canvas on top and
 * an invisible surface that turns taps into launches.
 */
export function CameraView(p: Props) {
  return (
    <>
      <div className="night-sky absolute inset-0" aria-hidden />
      <video
        ref={p.videoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
          p.showVideo ? "opacity-100" : "opacity-0"
        }`}
        style={{ transform: p.mirror ? "scaleX(-1)" : undefined }}
        muted
        playsInline
        autoPlay
        aria-hidden
      />
      <canvas ref={p.canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div
        className="absolute inset-0 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300/60"
        role="application"
        aria-label="Launch area. Tap, or press Space, to launch a firework. Hold to launch continuously."
        tabIndex={0}
        onPointerDown={p.onPointerDown}
        onPointerMove={p.onPointerMove}
        onPointerUp={p.onPointerUp}
        onPointerCancel={p.onPointerUp}
        onPointerLeave={p.onPointerUp}
        onKeyDown={p.onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      />
    </>
  );
}
