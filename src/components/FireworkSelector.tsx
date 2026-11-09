"use client";

import { useEffect, useRef } from "react";
import { FIREWORKS, RANDOM_ID } from "@/config/fireworks";
import { FireworkThumb } from "./FireworkThumb";

interface Props {
  selected: string;
  onSelect: (id: string) => void;
}

const ITEMS = [{ id: RANDOM_ID, name: "Random", def: null }, ...FIREWORKS.map((f) => ({ id: f.id, name: f.name, def: f }))];

/** Horizontal carousel of effects; selecting one activates it immediately. */
export function FireworkSelector({ selected, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected effect in view (e.g. after keyboard changes).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${selected}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = ITEMS.findIndex((i) => i.id === selected);
    const next = ITEMS[(idx + (e.key === "ArrowRight" ? 1 : ITEMS.length - 1)) % ITEMS.length];
    onSelect(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label="Firework effect"
      onKeyDown={onKey}
      className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto px-[max(1rem,env(safe-area-inset-left))] py-1"
    >
      {ITEMS.map((item) => {
        const active = item.id === selected;
        return (
          <button
            key={item.id}
            data-id={item.id}
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(item.id)}
            className={`flex w-[68px] shrink-0 snap-center flex-col items-center gap-1 rounded-2xl p-1.5 transition
              ${active ? "bg-white/20 ring-2 ring-amber-300" : "bg-black/35 hover:bg-black/50"}`}
          >
            <span className="overflow-hidden rounded-xl bg-[#05060f]">
              <FireworkThumb def={item.def} size={52} />
            </span>
            <span className={`w-full truncate text-center text-[10.5px] leading-tight ${active ? "text-white" : "text-white/80"}`}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
