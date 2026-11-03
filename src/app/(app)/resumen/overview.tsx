"use client";

import { AlertTriangle, Car, Crosshair, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers/session";
import { Changes } from "@/components/risk/changes";
import { HourlyChart } from "@/components/risk/hourly-chart";
import { OfficialAlerts } from "@/components/risk/official-alerts";
import { PhenomenonCard } from "@/components/risk/phenomenon-card";
import { CENTER, PlacePicker, toTarget, type Target } from "@/components/risk/place-picker";
import { Button, Glass, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { usePlaces } from "@/hooks/use-places";
import { useRisk } from "@/hooks/use-risk";
import { ago, fmtDateTime, until } from "@/lib/format";
import { inCoverage } from "@/lib/geo";
import { maxLevel, LEVEL_LABEL } from "@/lib/domain";

export function Overview() {
  const { places } = usePlaces();
  const session = useSession();
  const [here, setHere] = useState<Target | null>(null);
  const targets = useMemo(() => [...places.map(toTarget), ...(here ? [here] : []), CENTER], [places, here]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = targets.find((t) => t.id === selectedId) ?? targets[0];
  const { data: risk, isLoading, isError, error, refetch, isFetching } = useRisk({ lat: selected.lat, lon: selected.lon });

  function locate() {
    if (!("geolocation" in navigator)) return toast.error("Tu navegador no permite obtener la ubicación");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        if (!inCoverage(lat, lon)) return toast.error("Tu ubicación está fuera del área de cobertura (Córdoba y alrededores).");
        const t: Target = { id: "aqui", label: "Mi ubicación", lat, lon, kind: "aqui" };
        setHere(t);
        setSelectedId("aqui");
      },
      () => toast.error("No pudimos obtener tu ubicación"),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  const overall = risk ? maxLevel(risk.assessments.map((a) => a.level)) : null;
  const officialInside = risk?.official.filter((o) => (o as { relation?: string }).relation !== "cerca") ?? [];

  return (
    <div className="mx-auto grid max-w-6xl gap-6 pt-2">
      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Resumen para</p>
            <h1 className="display-title text-4xl sm:text-5xl">{selected.label}</h1>
            {selected.kind === "auto" && selected.watchUntil && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Car className="size-4" /> Vigilancia del auto: {until(selected.watchUntil)}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="glass" onClick={locate}><Crosshair /> Mi ubicación</Button>
            <Link href="/lugares" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground" data-slot="button" data-variant="default">
              <Car className="size-4" /> Dejé el auto acá
            </Link>
          </div>
        </div>
        <PlacePicker targets={targets} value={selected.id} onChange={(t) => setSelectedId(t.id)} />
      </section>

      {session.ownEstimatesMode === "shadow" && (
        <div className="flex items-start gap-3 rounded-2xl border border-brand/40 bg-brand-soft/60 p-4 text-sm">
          <FlaskConical className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>
            <strong>Estimaciones en evaluación (modo sombra).</strong> Las estimaciones del sistema todavía no tienen revisión meteorológica e hidrológica: se muestran como orientación y no generan notificaciones.
            Los avisos oficiales del SMN siempre tienen prioridad.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      )}

      {isError && (
        <Glass className="flex items-start gap-3 p-5">
          <AlertTriangle className="size-5 shrink-0 text-lvl-high" />
          <div className="text-sm">
            <p className="font-semibold">No pudimos calcular el estado para este lugar.</p>
            <p className="text-muted-foreground">{error.message}. Esto no significa que no haya riesgo: consultá directamente los avisos del SMN.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>Reintentar</Button>
          </div>
        </Glass>
      )}

      {risk && (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.1fr_2fr]">
            <Glass strong className="flex flex-col justify-between p-6">
              <div>
                <p className="text-xs text-muted-foreground">Situación general</p>
                <p className="display-title mt-1 text-3xl">
                  {officialInside.length ? `${officialInside.length} aviso${officialInside.length > 1 ? "s" : ""} oficial${officialInside.length > 1 ? "es" : ""}` : overall ? LEVEL_LABEL[overall] : "—"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {officialInside.length
                    ? "Hay avisos del SMN vigentes para este lugar. Seguí sus indicaciones."
                    : "Sin avisos oficiales que incluyan el lugar. Nivel máximo entre las estimaciones del sistema."}
                </p>
              </div>
              <div className="mt-6 grid gap-1 text-xs text-muted-foreground">
                <p>Calculado {ago(risk.generatedAt)} · {fmtDateTime(risk.generatedAt)}</p>
                <p>Celda de pronóstico: {risk.point.lat.toFixed(2)}, {risk.point.lon.toFixed(2)} (~5 km)</p>
                {isFetching && <p>Actualizando…</p>}
              </div>
            </Glass>
            <div className="grid gap-3">
              <SectionTitle eyebrow="Fuente oficial" title="Avisos del Servicio Meteorológico Nacional" />
              <OfficialAlerts alerts={risk.official} placeLabel={selected.label} />
            </div>
          </section>

          {risk.degraded.length > 0 && (
            <div role="status" className="rounded-2xl border border-lvl-watch/60 bg-lvl-watch/12 p-4 text-sm">
              <p className="font-semibold">Información degradada</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">{risk.degraded.map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
          )}

          <section className="grid gap-3">
            <SectionTitle eyebrow="Estimaciones del sistema · próximas 24 h" title="¿Qué puede pasar?" />
            <div className="grid gap-4 md:grid-cols-3">
              {risk.assessments.map((a) => {
                const mention = officialInside.find((o) => o.phenomena.includes(a.phenomenon) || (a.phenomenon === "anegamiento" && o.phenomena.includes("lluvia_intensa")));
                return (
                  <PhenomenonCard
                    key={a.phenomenon}
                    a={a}
                    shadow={risk.ownEstimatesMode === "shadow"}
                    officialMention={mention ? `el SMN emitió ${mention.color ? `alerta ${mention.color}` : "un aviso"} por ${mention.event.toLowerCase()} que ${a.phenomenon === "anegamiento" ? "menciona lluvias abundantes" : "menciona este fenómeno"}` : undefined}
                  />
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Glass className="p-5">
              <SectionTitle eyebrow="Pronóstico por hora" title="Lluvia prevista" />
              <p className="mt-1 text-xs text-muted-foreground">Barras: lluvia del modelo determinista (mm/h). Línea: % de miembros del ensamble con ≥ 10 mm/h.</p>
              <div className="mt-3"><HourlyChart data={risk.hourly} /></div>
            </Glass>
            <div className="grid gap-4">
              <Glass className="p-5">
                <SectionTitle eyebrow="Seguimiento" title="¿Qué cambió?" />
                <div className="mt-3"><Changes key={selected.id} placeId={selected.id} risk={risk} /></div>
              </Glass>
              <Glass className="p-5">
                <SectionTitle eyebrow="Con respaldo oficial" title="Qué hacer" />
                <ul className="mt-3 grid gap-3 text-sm">
                  {risk.recommendations.map((r, i) => (
                    <li key={i} className="leading-relaxed">
                      <p className="line-clamp-6 whitespace-pre-line">{r.text}</p>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">{r.source}</a>
                    </li>
                  ))}
                </ul>
              </Glass>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
