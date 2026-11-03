"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Pause, Play, X } from "lucide-react";
import type { FeatureCollection } from "geojson";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSession } from "@/components/providers/session";
import { Button, Glass } from "@/components/ui/primitives";
import { usePlaces } from "@/hooks/use-places";
import { useRisk } from "@/hooks/use-risk";
import { api } from "@/lib/api";
import { ago, fmtTime, whenRange } from "@/lib/format";
import { inCoverage } from "@/lib/geo";

const WeatherMap = dynamic(() => import("@/components/map/weather-map").then((m) => m.WeatherMap), { ssr: false });

type Sat = { template: string; frames: string[]; legend: { c: number; rgb: string }[]; attribution: string };
type Alerts = FeatureCollection & { status: { fetchedAt: string | null } };

export function RadarView() {
  const { user } = useSession();
  const { places } = usePlaces();
  const sat = useQuery({ queryKey: ["satellite"], queryFn: () => api<Sat>("/satellite"), refetchInterval: 5 * 60_000 });
  const alerts = useQuery({ queryKey: ["official", "area"], queryFn: () => api<Alerts>("/official-alerts?scope=area") });
  const [showAlerts, setShowAlerts] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const frames = sat.data?.frames ?? [];
  const [idx, setIdx] = useState<number | null>(null);
  const frame = idx ?? frames.length - 1;

  // Animación: 600 ms por cuadro y una pausa más larga en el último (el más reciente).
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setTimeout(() => setIdx(frame >= frames.length - 1 ? 0 : frame + 1), frame === frames.length - 1 ? 1800 : 600);
    return () => clearTimeout(t);
  }, [playing, frame, frames.length]);

  const time = frames[frame];

  return (
    <div className="relative -mx-4 h-[calc(100dvh-4rem-6rem)] overflow-hidden sm:-mx-6 md:mx-0 md:h-[calc(100dvh-6rem)] md:rounded-3xl">
      <WeatherMap
        alerts={alerts.data ?? null}
        places={user ? places : []}
        satellite={sat.data ? { template: sat.data.template, frames } : null}
        frame={frame}
        showAlerts={showAlerts}
        onPick={(lat, lon) => (inCoverage(lat, lon) ? setPicked({ lat, lon }) : null)}
        zoom={7}
      />

      {/* Controles de tiempo */}
      <Glass strong className="absolute right-3 bottom-3 left-3 z-10 grid gap-2 p-3 sm:right-auto sm:w-[26rem]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pausar" : "Reproducir"}>
            {playing ? <Pause /> : <Play />}
          </Button>
          <input
            type="range" min={0} max={Math.max(0, frames.length - 1)} value={frame}
            onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
            className="flex-1 accent-[var(--primary)]" aria-label="Hora de la imagen"
          />
          <span className="w-24 text-right text-sm tabular-nums">{time ? fmtTime(time) : "—"}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {sat.isLoading ? "Cargando imágenes…" : sat.isError ? "Satélite no disponible" : `Imagen de las ${fmtTime(time)} (${ago(time)}) · GOES-19, NASA`}
        </p>
        <Legend legend={sat.data?.legend ?? []} />
      </Glass>

      {/* Capas y enlace al radar oficial */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2">
        <button onClick={() => setShowAlerts((v) => !v)} aria-pressed={showAlerts} className="glass-strong rounded-full px-3.5 py-2 text-sm">
          {showAlerts ? "Ocultar" : "Mostrar"} alertas SMN
        </button>
        <a href="https://www.smn.gob.ar/radar" target="_blank" rel="noopener noreferrer" className="glass-strong inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm">
          Radar del SMN <ExternalLink className="size-3.5" />
        </a>
      </div>

      {picked && <PointCard point={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function Legend({ legend }: { legend: { c: number; rgb: string }[] }) {
  if (!legend.length) return null;
  const stops = [...legend].reverse();
  return (
    <div>
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${stops.map((s) => `rgb(${s.rgb})`).join(",")})` }} aria-hidden />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>Nubes bajas</span>
        <span>−40 °C</span>
        <span>Tormenta fuerte · −60 °C o menos</span>
      </div>
    </div>
  );
}

/** Tocar el mapa: veredicto para ese punto, sin necesidad de cuenta. */
function PointCard({ point, onClose }: { point: { lat: number; lon: number }; onClose: () => void }) {
  const { data, isLoading } = useRisk(point);
  const v = data?.verdict;
  return (
    <Glass strong className="absolute top-16 right-3 left-3 z-10 p-4 sm:left-auto sm:w-80">
      <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground" aria-label="Cerrar"><X className="size-4" /></button>
      <p className="text-xs text-muted-foreground">Punto elegido</p>
      {isLoading ? <p className="mt-1">Consultando…</p> : v && (
        <>
          <p className="display-title mt-1 text-3xl">{v.word}</p>
          {v.from && v.level !== "bajo" && <p className="text-sm">{whenRange(v.from, v.to)}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{v.line}</p>
        </>
      )}
    </Glass>
  );
}
