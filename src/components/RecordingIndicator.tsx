"use client";

import { MAX_RECORDING_SECONDS } from "@/capture/VideoRecorder";

export function RecordingIndicator({ seconds }: { seconds: number }) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const nearLimit = MAX_RECORDING_SECONDS - seconds <= 10;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold tabular-nums text-white shadow-lg"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
      <span>REC {mm}:{ss}</span>
      {nearLimit && <span className="opacity-80">· ending soon</span>}
    </div>
  );
}
