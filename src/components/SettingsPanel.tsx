"use client";

import { useEffect, useRef } from "react";
import type { Settings } from "@/types";
import { CloseIcon } from "./Icons";

interface Props {
  open: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  torchSupported: boolean;
  torchOn: boolean;
  onTorch: () => void;
  multipleCameras: boolean;
  recordingSupported: boolean;
  trackingActive: boolean;
}

function Segmented<T extends string>({
  label, value, options, onChange, disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 ${disabled ? "opacity-40" : ""}`}>
      <span className="text-sm text-white/90">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-full bg-white/10 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-2.5 py-1 text-xs transition ${
              value === o.value ? "bg-white font-semibold text-black" : "text-white/80"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const onOff = [
  { value: "on" as const, label: "On" },
  { value: "off" as const, label: "Off" },
];

/** Lightweight overlay; the camera stays live behind it. */
export function SettingsPanel(p: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const s = p.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => p.onChange({ ...s, [k]: v });

  useEffect(() => {
    if (!p.open) return;
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p.onClose]);

  if (!p.open) return null;

  return (
    <div className="ui absolute inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" onClick={p.onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="glass-strong max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button onClick={p.onClose} aria-label="Close settings" className="rounded-full p-1.5 text-white/80 hover:bg-white/10">
            <CloseIcon width={20} height={20} />
          </button>
        </div>

        <div className="divide-y divide-white/10">
          <Segmented label="Sound" value={s.sound ? "on" : "off"} options={onOff} onChange={(v) => set("sound", v === "on")} />
          <Segmented
            label="Flash (torch)"
            value={p.torchOn ? "on" : "off"}
            options={onOff}
            disabled={!p.torchSupported}
            onChange={(v) => (v === "on") !== p.torchOn && p.onTorch()}
          />
          <Segmented
            label="Quality"
            value={s.quality}
            options={[
              { value: "auto", label: "Auto" },
              { value: "high", label: "High" },
              { value: "medium", label: "Med" },
              { value: "low", label: "Low" },
            ]}
            onChange={(v) => set("quality", v)}
          />
          <Segmented
            label="Particles"
            value={s.intensity}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Med" },
              { value: "high", label: "High" },
            ]}
            onChange={(v) => set("intensity", v)}
          />
          <Segmented
            label="Motion"
            value={s.motion}
            options={[
              { value: "normal", label: "Normal" },
              { value: "reduced", label: "Reduced" },
            ]}
            onChange={(v) => set("motion", v)}
          />
          <Segmented
            label="Flashing effects"
            value={s.flash}
            options={[
              { value: "normal", label: "Normal" },
              { value: "reduced", label: "Reduced" },
            ]}
            onChange={(v) => set("flash", v)}
          />
          <Segmented
            label="Camera"
            value={s.facing}
            disabled={!p.multipleCameras}
            options={[
              { value: "user", label: "Front" },
              { value: "environment", label: "Rear" },
            ]}
            onChange={(v) => set("facing", v)}
          />
          <Segmented
            label="Recording quality"
            value={s.recordingQuality}
            disabled={!p.recordingSupported}
            options={[
              { value: "auto", label: "Auto" },
              { value: "high", label: "High" },
              { value: "standard", label: "Std" },
            ]}
            onChange={(v) => set("recordingQuality", v)}
          />
          <Segmented
            label="Motion tracking"
            value={s.tracking ? "on" : "off"}
            options={onOff}
            onChange={(v) => set("tracking", v === "on")}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/55">
          {s.tracking
            ? p.trackingActive
              ? "Motion tracking is on: fireworks stay in place as you move your phone."
              : "Motion sensors aren’t sending data, so fireworks follow the screen."
            : "Fireworks follow the screen."}{" "}
          Camera images are processed on your device and never uploaded.
        </p>
      </div>
    </div>
  );
}
