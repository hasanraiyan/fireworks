"use client";

import { useEffect, useRef } from "react";
import type { FireworkDefinition } from "@/types";
import { PALETTE } from "@/config/fireworks";
import { planarPattern, PLANAR, sphere, palm } from "@/engine/shapes";

/** Deterministic PRNG so thumbnails are identical on every render. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function seedOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h;
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 1) {
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.3, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawThumb(ctx: CanvasRenderingContext2D, size: number, def: FireworkDefinition | null) {
  const c = size / 2;
  const R = size * 0.36;
  const rand = rng(seedOf(def?.id ?? "random"));
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = "lighter";
  const c1 = def?.colors?.[0] ?? PALETTE[(rand() * PALETTE.length) | 0];
  const c2 = def?.colors?.[1] ?? PALETTE[(rand() * PALETTE.length) | 0];
  const pr = size * 0.022;

  const radial = (n: number, len: number, col: () => string, trail: boolean, droop = 0) => {
    for (const d of sphere(n, 0.1, rand)) {
      const x = d[0], y = -d[1];
      const ex = c + x * len, ey = c + y * len;
      if (trail) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = col();
        ctx.lineWidth = pr * 0.6;
        ctx.beginPath();
        ctx.moveTo(c + x * len * 0.25, c + y * len * 0.25);
        ctx.quadraticCurveTo(ex, ey, ex, ey + droop * len);
        ctx.stroke();
      }
      dot(ctx, ex, ey + droop * len, pr, col());
    }
  };

  if (!def) {
    // Random: a scatter of mini bursts in many colours.
    for (let k = 0; k < 5; k++) {
      const x = size * (0.2 + rand() * 0.6), y = size * (0.2 + rand() * 0.6);
      const col = PALETTE[(rand() * PALETTE.length) | 0];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        dot(ctx, x + Math.cos(a) * size * 0.1, y + Math.sin(a) * size * 0.1, pr * 0.8, col);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `700 ${size * 0.32}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", c, c + size * 0.02);
    return;
  }

  switch (def.kind) {
    case "fountain": {
      for (let i = 0; i < 70; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 0.7;
        const t = rand();
        const v = size * 0.8;
        const x = c + Math.cos(a) * v * t * 0.6;
        const y = size * 0.9 + Math.sin(a) * v * t + t * t * size * 0.35;
        dot(ctx, x, y, pr * 0.7, rand() < 0.3 ? c2 : c1, 1 - t * 0.6);
      }
      return;
    }
    case "candle": {
      for (let i = 0; i < 5; i++) {
        const y = size * 0.85 - i * size * 0.16;
        const col = PALETTE[(i * 3) % PALETTE.length];
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = col;
        ctx.lineWidth = pr;
        ctx.beginPath();
        ctx.moveTo(c + (i % 2 ? 1 : -1) * size * 0.04, y + size * 0.1);
        ctx.lineTo(c + (i % 2 ? -1 : 1) * size * 0.04, y);
        ctx.stroke();
        dot(ctx, c + (i % 2 ? -1 : 1) * size * 0.04, y, pr * 1.6, col);
      }
      return;
    }
    case "bomb": {
      const bx = c, by = size * 0.66, br = size * 0.2;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(bx - br * 0.4, by - br * 0.4, br * 0.1, bx, by, br);
      g.addColorStop(0, "#a8733f");
      g.addColorStop(1, "#4a2c14");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b3201c";
      ctx.fillRect(bx - br, by - br * 0.15, br * 2, br * 0.3);
      ctx.strokeStyle = "#d9c38a";
      ctx.lineWidth = size * 0.025;
      ctx.beginPath();
      ctx.moveTo(bx, by - br);
      ctx.quadraticCurveTo(bx + br * 0.2, by - br * 1.5, bx + br * 0.55, by - br * 1.8);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      const tx = bx + br * 0.55, ty = by - br * 1.8;
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.6, r = size * (0.04 + rand() * 0.16);
        dot(ctx, tx + Math.cos(a) * r, ty + Math.sin(a) * r, pr * 0.55, rand() < 0.4 ? "#fff6d0" : "#ffb347");
      }
      dot(ctx, tx, ty, pr * 1.4, "#ffb347");
      return;
    }
    case "comet": {
      for (let i = 0; i < 40; i++) {
        const t = i / 40;
        const x = size * 0.2 + t * size * 0.55, y = size * 0.85 - t * size * 0.65;
        dot(ctx, x + (rand() - 0.5) * size * 0.05 * (1 - t), y, pr * (0.4 + t), t > 0.9 ? "#fff" : c1, t);
      }
      return;
    }
    case "finale": {
      const cols = ["#ff3b5c", "#ffd23f", "#45b8ff", "#59ff8f", "#c85cff"];
      const spots = [[0.3, 0.32], [0.7, 0.3], [0.5, 0.55], [0.25, 0.7], [0.75, 0.68]];
      spots.forEach(([sx, sy], k) => {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          dot(ctx, size * sx + Math.cos(a) * size * 0.13, size * sy + Math.sin(a) * size * 0.13, pr * 0.8, cols[k]);
        }
      });
      return;
    }
  }

  if (PLANAR.has(def.shape)) {
    for (const [x, y] of planarPattern(def.shape, 48)) dot(ctx, c + x * R, c - y * R, pr, c1);
    return;
  }
  switch (def.shape) {
    case "willow":
      radial(26, R * 0.8, () => c1, true, 0.35);
      break;
    case "brocade":
      radial(30, R * 0.9, () => (rand() < 0.5 ? c1 : c2), true, 0.15);
      break;
    case "chrysanthemum":
      radial(34, R, () => c1, true);
      break;
    case "palm":
      for (const d of palm(9, rand)) {
        const ex = c + d[0] * R, ey = c - Math.abs(d[1]) * R * 0.8 + R * 0.1;
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = c1;
        ctx.lineWidth = pr * 1.4;
        ctx.beginPath();
        ctx.moveTo(c, c + R * 0.1);
        ctx.quadraticCurveTo(ex, ey - R * 0.2, ex, ey + R * 0.2);
        ctx.stroke();
        dot(ctx, ex, ey + R * 0.2, pr * 1.3, c1);
      }
      break;
    case "ring":
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        dot(ctx, c + Math.cos(a) * R, c + Math.sin(a) * R * 0.55, pr, c1);
      }
      break;
    case "double":
      radial(36, R, () => c1, false);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        dot(ctx, c + Math.cos(a) * R * 0.5, c + Math.sin(a) * R * 0.5, pr * 0.9, c2);
      }
      break;
    case "crossette":
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const x = c + Math.cos(a) * R * 0.55, y = c + Math.sin(a) * R * 0.55;
        dot(ctx, x, y, pr * 1.2, c1);
        for (let j = 0; j < 4; j++) {
          const b = a + Math.PI / 4 + (j * Math.PI) / 2;
          dot(ctx, x + Math.cos(b) * R * 0.3, y + Math.sin(b) * R * 0.3, pr * 0.8, c2);
        }
      }
      break;
    case "crackle":
    case "strobe":
      radial(28, R * 0.85, () => c1, false);
      for (let i = 0; i < 40; i++) {
        const a = rand() * Math.PI * 2, r = R * (0.5 + rand() * 0.6);
        dot(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, pr * 0.45, "#ffffff", 0.9);
      }
      break;
    case "multicolor":
      radial(40, R, () => PALETTE[(rand() * PALETTE.length) | 0], false);
      break;
    default:
      radial(36, R, () => (rand() < 0.75 ? c1 : c2), def.trail > 0.3);
  }
}

export function FireworkThumb({ def, size = 56 }: { def: FireworkDefinition | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawThumb(ctx, size * dpr, def);
  }, [def, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}
