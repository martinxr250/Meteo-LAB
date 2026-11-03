"use client";

import { ChevronDown, Crosshair } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HourStrip, HourTimeline } from "@/components/risk/hour-strip";
import { CENTER, PlacePicker, toTarget, type Target } from "@/components/risk/place-picker";
import { Button, Glass, Skeleton } from "@/components/ui/primitives";
import { usePlaces } from "@/hooks/use-places";
import { useRisk } from "@/hooks/use-risk";
import { LEVEL_LABEL, LEVEL_ORDER, PHENOMENON_LABEL, type Level, type PointRisk } from "@/lib/domain";
import { ago, fmtDateTime, until, whenRange } from "@/lib/format";
import { inCoverage } from "@/lib/geo";
import { cn } from "@/lib/utils";

const LEVEL_TEXT: Record<Level, string> = {
  muy_alto: "text-lvl-severe",
  alto: "text-lvl-high",
  atento: "text-[color-mix(in_oklch,var(--lvl-watch),var(--foreground)_30%)]",
  bajo: "text-foreground",
  sin_datos: "text-muted-foreground",
};

export function Overview() {
  const { places } = usePlaces();
  const [here, setHere] = useState<Target | null>(null);
  const targets = useMemo(() => [...places.map(toTarget), ...(here ? [here] : []), CENTER], [places, here]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = targets.find((t) => t.id === selectedId) ?? targets[0];
  const { data: risk, isLoading, isError, refetch } = useRisk({ lat: selected.lat, lon: selected.lon });

  function locate() {
    if (!("geolocation" in navigator)) return toast.error("Tu navegador no permite obtener la ubicación");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        if (!inCoverage(lat, lon)) return toast.error("Por ahora cubrimos Córdoba y alrededores.");
        setHere({ id: "aqui", label: "Acá", lat, lon, kind: "aqui" });
        setSelectedId("aqui");
      },
      () => toast.error("No pudimos obtener tu ubicación"),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PlacePicker targets={targets} value={selected.id} onChange={(t) => setSelectedId(t.id)} />
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={locate} aria-label="Usar mi ubicación"><Crosshair /></Button>
          <Link href="/lugares#auto" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85">Dejé el auto acá</Link>
        </div>
      </div>

      {isLoading && <Skeleton className="h-72" />}
      {isError && (
        <Glass className="p-6">
          <p className="text-2xl font-light">No pudimos consultar</p>
          <p className="mt-1 text-sm text-muted-foreground">Revisá los avisos del SMN directamente.</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => refetch()}>Reintentar</Button>
        </Glass>
      )}
      {risk && <Answer risk={risk} placeId={selected.id} label={selected.label} watchUntil={selected.watchUntil ?? null} />}
    </div>
  );
}

function Answer({ risk, placeId, label, watchUntil }: { risk: PointRisk; placeId: string; label: string; watchUntil: string | null }) {
  const v = risk.verdict;
  const when = whenRange(v.from, v.to);
  const change = useChange(placeId, v.level);

  return (
    <>
      <Glass strong className="p-6 sm:p-8">
        <p className="text-sm text-muted-foreground">{label}{watchUntil ? ` · vigilancia ${until(watchUntil)}` : ""}</p>
        <p className={cn("display-title mt-2 text-5xl sm:text-6xl", LEVEL_TEXT[v.level])}>{v.word}</p>
        {when && v.level !== "bajo" && <p className="mt-3 text-xl">{when}</p>}
        <p className="mt-2 text-sm text-muted-foreground">{v.line}</p>
        {change && <p className="mt-1 text-sm font-medium">{change}</p>}

        {v.facts.length > 0 && (
          <dl className="mt-6 grid grid-cols-3 divide-x divide-border border-t border-border pt-4">
            {v.facts.slice(0, 3).map((f) => (
              <div key={f.label} className="px-3 first:pl-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Glass>

      <Glass className="grid gap-4 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Hora por hora</h2>
          {risk.hourly.some((h) => h.inAlert) && <span className="text-xs text-muted-foreground">Sombreado: horas con aviso del SMN</span>}
        </div>
        <HourTimeline data={risk.hourly} />
        <HourStrip data={risk.hourly} />
      </Glass>

      <Details risk={risk} />
    </>
  );
}

/** Una sola línea si cambió el nivel desde la última consulta en este dispositivo. */
function useChange(placeId: string, level: Level) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const k = `meteolab.last.${placeId}`;
    let prev: { level: Level; at: string } | null = null;
    try {
      prev = JSON.parse(localStorage.getItem(k) ?? "null");
      if (!prev || Date.now() - new Date(prev.at).getTime() > 20 * 60_000) localStorage.setItem(k, JSON.stringify({ level, at: new Date().toISOString() }));
    } catch {}
    const text = prev && prev.level !== level ? `${LEVEL_ORDER[level] > LEVEL_ORDER[prev.level] ? "Subió" : "Bajó"} desde tu última consulta (${ago(prev.at)})` : null;
    // Lectura de almacenamiento externo: se sincroniza una vez por lugar y nivel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMsg(text);
  }, [placeId, level]);
  return msg;
}

function Details({ risk }: { risk: PointRisk }) {
  const [open, setOpen] = useState(false);
  const inside = risk.official.filter((o) => (o as { relation?: string }).relation !== "cerca");
  const near = risk.official.filter((o) => (o as { relation?: string }).relation === "cerca");
  const degraded = risk.sources.filter((s) => !s.ok || s.stale);

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        Detalle <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <Glass className="mt-3 divide-y divide-border text-sm">
          {inside.length > 0 && (
            <section className="p-5">
              <h3 className="font-semibold">Avisos del SMN</h3>
              {inside.map((a) => (
                <div key={a.id} className="mt-3">
                  <p className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-full", a.color ? `bg-smn-${a.color}` : "bg-muted-foreground")} aria-hidden />
                    <span className="font-medium">{a.color ? `Alerta ${a.color}` : "Aviso"} · {a.event}</span>
                    <span className="text-muted-foreground">{whenRange(a.onset ?? a.sent, a.expires)}</span>
                  </p>
                  <p className="mt-1 text-muted-foreground">{a.description}</p>
                  {a.instruction && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-primary">Qué hacer</summary>
                      <p className="mt-1 whitespace-pre-line">{a.instruction}</p>
                    </details>
                  )}
                  <a href={a.web} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-muted-foreground underline">Fuente oficial</a>
                </div>
              ))}
              {near.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Además, {near.length} aviso{near.length > 1 ? "s" : ""} en zonas a menos de 15 km.</p>}
            </section>
          )}

          <section className="p-5">
            <h3 className="font-semibold">Estimación propia · 24 h</h3>
            <table className="mt-2 w-full text-left">
              <tbody className="divide-y divide-border">
                {risk.assessments.map((a) => (
                  <tr key={a.phenomenon} className="align-top">
                    <td className="py-2 pr-3">{PHENOMENON_LABEL[a.phenomenon]}</td>
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{LEVEL_LABEL[a.level]}</td>
                    <td className="py-2 text-muted-foreground">{a.indicator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              En evaluación, no genera notificaciones. Modelos globales de ~25 km: no ven tormentas puntuales. <Link href="/fuentes" className="underline">Cómo se calcula</Link>
            </p>
          </section>

          <section className="p-5 text-xs text-muted-foreground">
            Actualizado {fmtDateTime(risk.generatedAt)}.{" "}
            {degraded.length ? `Sin datos al día de: ${degraded.map((d) => d.name).join(", ")}.` : "Todas las fuentes al día."}
          </section>
        </Glass>
      )}
    </div>
  );
}
