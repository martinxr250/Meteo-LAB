"use client";

import type { Place, PlaceKind } from "@/lib/domain";
import { COVERAGE } from "@/lib/geo";
import { cn } from "@/lib/utils";

export type Target = { id: string; label: string; lat: number; lon: number; kind: PlaceKind | "centro" | "aqui"; watchUntil?: string | null };

export const CENTER: Target = { id: "centro", label: "Córdoba", lat: COVERAGE.center.lat, lon: COVERAGE.center.lon, kind: "centro" };

export function toTarget(p: Place): Target {
  return { id: p.id, label: p.label, lat: p.lat, lon: p.lon, kind: p.kind, watchUntil: p.watchUntil };
}

/** Control segmentado de lugares. */
export function PlacePicker({ targets, value, onChange }: { targets: Target[]; value: string; onChange: (t: Target) => void }) {
  return (
    <div className="glass scroll-thin flex max-w-full gap-0.5 overflow-x-auto rounded-full p-1" role="tablist" aria-label="Lugar">
      {targets.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t)}
          className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors", t.id === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
