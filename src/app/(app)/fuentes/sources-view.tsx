"use client";

import { Fragment, useState } from "react";
import { Glass, SectionTitle } from "@/components/ui/primitives";
import { useStatus } from "@/hooks/use-risk";
import { ago } from "@/lib/format";
import { SOURCE_STATE_LABEL, SOURCES } from "@/lib/sources-catalog";
import { cn } from "@/lib/utils";

export function SourcesView() {
  const status = useStatus();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mx-auto grid max-w-4xl gap-6 pt-2">
      <h1 className="display-title text-4xl">Fuentes</h1>

      <section className="grid gap-2">
        <SectionTitle title="Ahora" />
        <Glass className="divide-y divide-border text-sm">
          {status.data?.sources.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("size-2 rounded-full", !s.ok ? "bg-lvl-severe" : s.stale ? "bg-lvl-watch" : "bg-success")} aria-hidden />
              <span className="flex-1">{s.name}</span>
              <span className="text-xs text-muted-foreground">{!s.ok ? "Sin respuesta" : ago(s.dataTime)}</span>
            </div>
          ))}
          {status.isLoading && <p className="px-4 py-3 text-muted-foreground">Consultando…</p>}
        </Glass>
      </section>

      <section className="grid gap-2">
        <SectionTitle title="Evaluadas" meta="Tocá una fila para ver el detalle" />
        <Glass className="overflow-hidden text-sm">
          <table className="w-full text-left">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 font-normal">Fuente</th><th className="px-4 py-2 font-normal">Estado</th><th className="hidden px-4 py-2 font-normal sm:table-cell">Uso</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SOURCES.map((s) => (
                <Fragment key={s.id}>
                  <tr className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                    <td className="px-4 py-3">{s.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{SOURCE_STATE_LABEL[s.state]}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{s.usedFor[0]}</td>
                  </tr>
                  {open === s.id && (
                    <tr>
                      <td colSpan={3} className="bg-muted/30 px-4 py-3 text-xs">
                        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                          {([["Variables", s.variables], ["Resolución", `${s.spatialRes} · ${s.temporalRes}`], ["Latencia", s.latency], ["Acceso", s.access], ["Licencia", s.license], ["Limitaciones", s.limitations]] as const).map(([k, v]) => (
                            <div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
                          ))}
                        </dl>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-primary underline">{new URL(s.url).hostname}</a>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Glass>
      </section>
    </div>
  );
}
