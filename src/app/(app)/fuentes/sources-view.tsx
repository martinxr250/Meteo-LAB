"use client";

import { ExternalLink } from "lucide-react";
import { Glass, Pill, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { useStatus } from "@/hooks/use-risk";
import { ago } from "@/lib/format";
import { SOURCE_STATE_LABEL, SOURCES, type SourceState } from "@/lib/sources-catalog";
import { cn } from "@/lib/utils";

const STATE_STYLE: Record<SourceState, string> = {
  identificada: "bg-muted text-muted-foreground",
  acceso_probado: "bg-primary/12 text-primary",
  apta_produccion: "bg-success/15 text-success",
  bloqueada: "bg-lvl-high/18 text-[color-mix(in_oklch,var(--lvl-high),var(--foreground)_40%)]",
};

export function SourcesView() {
  const status = useStatus();
  return (
    <div className="mx-auto grid max-w-6xl gap-6 pt-2">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Transparencia</p>
        <h1 className="display-title text-4xl sm:text-5xl">Fuentes y estado</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Distinguimos fuentes <em>identificadas</em>, con <em>acceso probado</em> (muestras reales descargadas) y <em>aptas para producción</em> (además, licencia clara y 30 días de monitoreo). Ninguna alcanzó todavía ese último estado.
        </p>
      </div>

      <section className="grid gap-3">
        <SectionTitle eyebrow="Ahora" title="Actualización de los datos" />
        {status.isLoading && <Skeleton className="h-24" />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {status.data?.sources.map((s) => (
            <Glass key={s.id} className="p-4">
              <div className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", !s.ok ? "bg-lvl-severe" : s.stale ? "bg-lvl-watch" : "bg-success")} />
                <p className="text-sm font-semibold">{s.name}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{!s.ok ? s.error ?? "Sin respuesta" : s.stale ? "Datos desactualizados" : "Al día"}</p>
              <p className="text-xs text-muted-foreground">Dato más reciente: {ago(s.dataTime)}</p>
            </Glass>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <SectionTitle eyebrow="Matriz" title="Fuentes evaluadas para Córdoba" />
        <div className="grid gap-3">
          {SOURCES.map((s) => (
            <Glass key={s.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="text-xs text-muted-foreground">{s.owner}</p>
                </div>
                <Pill className={STATE_STYLE[s.state]}>{SOURCE_STATE_LABEL[s.state]}{s.probedAt ? ` · ${s.probedAt}` : ""}</Pill>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["Variables", s.variables], ["Cobertura", s.coverage], ["Resolución espacial", s.spatialRes], ["Resolución temporal", s.temporalRes],
                  ["Latencia", s.latency], ["Archivo histórico", s.history], ["Acceso", s.access], ["Licencia", s.license], ["Costo", s.cost],
                ] as const).map(([k, v]) => (
                  <div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <p className="mt-3 text-xs"><strong>Limitaciones:</strong> {s.limitations}</p>
              <p className="mt-1 text-xs"><strong>Uso en Meteo-LAB:</strong> {s.usedFor.join(" · ")}{s.dependsOn ? ` · Depende de: ${s.dependsOn.join(", ")}` : ""}</p>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">Sitio oficial <ExternalLink className="size-3" /></a>
            </Glass>
          ))}
        </div>
      </section>
    </div>
  );
}
