"use client";

import type { Mode } from "@/types";

export function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opts: { id: Mode; label: string }[] = [
    { id: "sky", label: "Sky" },
    { id: "world", label: "World" },
  ];
  return (
    <div role="radiogroup" aria-label="Mode" className="glass flex rounded-full p-1 text-xs font-semibold tracking-wide">
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={mode === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-4 py-1.5 uppercase transition ${
            mode === o.id ? "bg-white text-black" : "text-white/85 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
