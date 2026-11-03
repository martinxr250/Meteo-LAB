"use client";

import { ArrowDownRight, ArrowUpRight, History } from "lucide-react";
import { useEffect, useState } from "react";
import { LEVEL_LABEL, LEVEL_ORDER, PHENOMENON_LABEL, type Level, type PointRisk } from "@/lib/domain";
import { ago } from "@/lib/format";

/** "¿Cambió el riesgo desde la última vez?" — compara con la última consulta guardada en este navegador. */
type Snap = { at: string; levels: Record<string, Level>; official: string[] };
const key = (id: string) => `meteolab.snap.${id}`;

function readSnap(placeId: string): Snap | null {
  try {
    return JSON.parse(localStorage.getItem(key(placeId)) ?? "null");
  } catch {
    return null;
  }
}

/** Montar con `key={placeId}`: la comparación se toma una vez por lugar. */
export function Changes({ placeId, risk }: { placeId: string; risk: PointRisk }) {
  const [prev] = useState<Snap | null>(() => readSnap(placeId));
  useEffect(() => {
    const stored = readSnap(placeId);
    const now: Snap = { at: risk.generatedAt, levels: Object.fromEntries(risk.assessments.map((a) => [a.phenomenon, a.level])), official: risk.official.map((o) => o.id) };
    // Solo se reemplaza si pasaron 20 min: así un refresco no borra la comparación.
    if (!stored || Date.now() - new Date(stored.at).getTime() > 20 * 60_000) {
      try {
        localStorage.setItem(key(placeId), JSON.stringify(now));
      } catch {}
    }
  }, [placeId, risk]);

  if (!prev) return <p className="text-sm text-muted-foreground">Es la primera consulta de este lugar en este dispositivo.</p>;
  const changes = risk.assessments
    .map((a) => ({ p: a.phenomenon, from: prev.levels[a.phenomenon], to: a.level }))
    .filter((c) => c.from && c.from !== c.to);
  const newOfficial = risk.official.filter((o) => !prev.official.includes(o.id)).length;
  const goneOfficial = prev.official.filter((id) => !risk.official.some((o) => o.id === id)).length;

  return (
    <div className="grid gap-2 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground"><History className="size-4" /> Comparado con tu consulta de {ago(prev.at)}</p>
      {!changes.length && !newOfficial && !goneOfficial && <p>Sin cambios de nivel.</p>}
      {newOfficial > 0 && <p className="font-medium">• {newOfficial} aviso{newOfficial > 1 ? "s" : ""} oficial{newOfficial > 1 ? "es" : ""} nuevo{newOfficial > 1 ? "s" : ""}.</p>}
      {goneOfficial > 0 && <p>• {goneOfficial} aviso{goneOfficial > 1 ? "s" : ""} oficial{goneOfficial > 1 ? "es" : ""} ya no está{goneOfficial > 1 ? "n" : ""} vigente{goneOfficial > 1 ? "s" : ""}.</p>}
      {changes.map((c) => {
        const up = LEVEL_ORDER[c.to] > LEVEL_ORDER[c.from];
        const Icon = up ? ArrowUpRight : ArrowDownRight;
        return (
          <p key={c.p} className="flex items-center gap-1.5">
            <Icon className={up ? "size-4 text-lvl-high" : "size-4 text-lvl-low"} aria-hidden />
            {PHENOMENON_LABEL[c.p]}: {LEVEL_LABEL[c.from]} → <strong>{LEVEL_LABEL[c.to]}</strong>
          </p>
        );
      })}
    </div>
  );
}
