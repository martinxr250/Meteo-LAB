"use client";
import type { FeatureCollection } from "geojson";

import { useQuery } from "@tanstack/react-query";
import { Layers, Radar, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { OfficialColorBadge } from "@/components/risk/badges";
import { Glass } from "@/components/ui/primitives";
import { usePlaces } from "@/hooks/use-places";
import { api } from "@/lib/api";
import type { OfficialColor } from "@/lib/domain";
import { ago, fmtDateTime, fmtTime, until } from "@/lib/format";
import type { RadarFrame } from "@/components/map/weather-map";

const WeatherMap = dynamic(() => import("@/components/map/weather-map").then((m) => m.WeatherMap), { ssr: false });

type AlertsResponse = FeatureCollection & { attribution: string; status: { fetchedAt: string | null; dataTime: string | null; ok: boolean } };
type RadarResponse = { host: string; frames: RadarFrame[]; attribution: string; fetchedAt: string };

export function MapView() {
  const { places } = usePlaces();
  const [scope, setScope] = useState<"area" | "pais">("area");
  const [showAlerts, setShowAlerts] = useState(true);
  const [showRadar, setShowRadar] = useState(true);
  const [opacity, setOpacity] = useState(0.7);
  const [frameIdx, setFrameIdx] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  const alerts = useQuery({ queryKey: ["official", scope], queryFn: () => api<AlertsResponse>(`/official-alerts?scope=${scope}`) });
  const radar = useQuery({ queryKey: ["radar"], queryFn: () => api<RadarResponse>("/radar"), retry: 1 });
  const frames = radar.data?.frames ?? [];
  const idx = frameIdx ?? frames.length - 1;
  const frame = showRadar && frames[idx] ? frames[idx] : null;

  return (
    <div className="relative -mx-4 h-[calc(100dvh-4rem-6rem)] overflow-hidden sm:-mx-6 md:mx-0 md:h-[calc(100dvh-6rem)] md:rounded-3xl">
      <WeatherMap
        alerts={alerts.data ?? null}
        places={places}
        radar={frame}
        radarHost={radar.data?.host ?? null}
        showAlerts={showAlerts}
        radarOpacity={opacity}
        onAlertClick={setSelected}
      />

      <Glass strong className="absolute top-3 left-3 z-10 w-[min(20rem,calc(100%-4.5rem))] p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold"><Layers className="size-4" /> Capas</p>
        <label className="mt-3 flex items-center justify-between gap-2">
          <span>Alertas SMN</span>
          <input type="checkbox" checked={showAlerts} onChange={(e) => setShowAlerts(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        </label>
        <div className="mt-1 flex gap-1 text-xs">
          {(["area", "pais"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} className={`rounded-full px-2.5 py-1 ${scope === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s === "area" ? "Córdoba" : "Todo el país"}</button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {alerts.isLoading ? "Cargando…" : alerts.isError ? "SMN sin respuesta" : `${alerts.data?.features.length ?? 0} zonas · ${ago(alerts.data?.status.fetchedAt)}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm bg-smn-amarilla" /> Amarilla</span>
          <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm bg-smn-naranja" /> Naranja</span>
          <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm bg-smn-roja" /> Roja</span>
        </div>

        <hr className="my-3 border-border" />
        <label className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5"><Radar className="size-4" /> Radar</span>
          <input type="checkbox" checked={showRadar} onChange={(e) => setShowRadar(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        </label>
        {radar.isError && <p className="mt-1 text-[11px] text-muted-foreground">Radar no disponible.</p>}
        {frames.length > 0 && showRadar && (
          <>
            <input type="range" min={0} max={frames.length - 1} value={idx} onChange={(e) => setFrameIdx(Number(e.target.value))} className="mt-2 w-full accent-[var(--primary)]" aria-label="Hora del cuadro de radar" />
            <p className="text-[11px] text-muted-foreground">{fmtTime(frames[idx]?.time)} · RainViewer</p>
            <label className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
              Opacidad
              <input type="range" min={0.2} max={1} step={0.1} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="accent-[var(--primary)]" />
            </label>
          </>
        )}
      </Glass>

      {selected && (
        <Glass strong className="absolute right-3 bottom-3 left-3 z-10 max-h-[45%] overflow-y-auto p-4 text-sm sm:left-auto sm:w-96">
          <button onClick={() => setSelected(null)} className="absolute top-3 right-3 text-muted-foreground" aria-label="Cerrar"><X className="size-4" /></button>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <OfficialColorBadge color={(selected.color as OfficialColor) ?? null} />
            <span className="text-xs text-muted-foreground">{selected.product === "aviso_corto_plazo" ? "Aviso a corto plazo" : "Alerta por zonas"} · SMN</span>
          </div>
          <p className="mt-2 font-semibold">{String(selected.headline || selected.event)}</p>
          {selected.areaDesc ? <p className="mt-1 text-xs text-muted-foreground">{String(selected.areaDesc)}</p> : null}
          <p className="mt-2 text-xs">Desde {fmtDateTime((selected.onset as string) || (selected.sent as string))} hasta {fmtDateTime(selected.expires as string)} · {until(selected.expires as string)}</p>
          <a href={String(selected.web)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline">Documento oficial</a>
        </Glass>
      )}
    </div>
  );
}
