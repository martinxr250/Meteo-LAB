"use client";

import { Car, Crosshair, Home, Briefcase, MapPin } from "lucide-react";
import type { Place, PlaceKind } from "@/lib/domain";
import { COVERAGE } from "@/lib/geo";
import { cn } from "@/lib/utils";

export type Target = { id: string; label: string; lat: number; lon: number; kind: PlaceKind | "centro" | "aqui"; watchUntil?: string | null };

export const CENTER: Target = { id: "centro", label: "Centro de Córdoba", lat: COVERAGE.center.lat, lon: COVERAGE.center.lon, kind: "centro" };
const ICON = { casa: Home, trabajo: Briefcase, auto: Car, otro: MapPin, centro: MapPin, aqui: Crosshair };

export function toTarget(p: Place): Target {
  return { id: p.id, label: p.label, lat: p.lat, lon: p.lon, kind: p.kind, watchUntil: p.watchUntil };
}

export function PlacePicker({ targets, value, onChange }: { targets: Target[]; value: string; onChange: (t: Target) => void }) {
  return (
    <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Lugar a consultar">
      {targets.map((t) => {
        const Icon = ICON[t.kind];
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t)}
            className={cn("glass flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors", active && "!bg-primary text-primary-foreground")}
          >
            <Icon className="size-4" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
