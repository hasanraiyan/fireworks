"use client";

import { useEffect, useState } from "react";
import type { CapturedMedia } from "@/types";
import { saveMedia } from "@/capture/VideoRecorder";
import { CloseIcon, DownloadIcon, TrashIcon } from "./Icons";

interface Props {
  media: CapturedMedia;
  onDone: () => void;
  onToast: (m: string) => void;
}

/** Review a capture, then save it locally (nothing is uploaded). */
export function MediaPreview({ media, onDone, onToast }: Props) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveMedia(media);
      if (res !== "cancelled") {
        onToast(media.kind === "photo" ? "Photo saved" : "Video saved");
        onDone();
      }
    } catch {
      onToast("Couldn’t save — your device may be out of storage");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui absolute inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="text-sm font-semibold text-white">{media.kind === "photo" ? "Photo" : "Video"}</span>
        <button onClick={onDone} aria-label="Close preview" className="rounded-full p-2 text-white hover:bg-white/10">
          <CloseIcon />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {media.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url} alt="Captured fireworks photo" className="max-h-full max-w-full rounded-2xl shadow-2xl" />
        ) : (
          <video src={media.url} controls playsInline autoPlay loop className="max-h-full max-w-full rounded-2xl shadow-2xl" />
        )}
      </div>
      <div className="flex justify-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button onClick={onDone} className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-white">
          <TrashIcon width={18} height={18} /> Discard
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          <DownloadIcon width={18} height={18} /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
