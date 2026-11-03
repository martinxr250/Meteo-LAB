"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/components/providers/session";
import { CENTER, toTarget, type Target } from "@/components/risk/place-picker";
import { Glass, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { usePlaces } from "@/hooks/use-places";
import { useRisk } from "@/hooks/use-risk";
import { api } from "@/lib/api";
import type { Level } from "@/lib/domain";
import { ago, fmtDateTime, whenRange } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NoticeRow {
  id: string; kind: string; level: Level; state: string; title: string; last_changed: string; shadow: boolean;
  notice_events: { change: string; at: string }[];
}

const DOT: Record<Level, string> = { muy_alto: "bg-lvl-severe", alto: "bg-lvl-high", atento: "bg-lvl-watch", bajo: "bg-lvl-low", sin_datos: "bg-lvl-none" };
const STATE: Record<string, string> = { activo: "Activo", resuelto: "Terminó", vencido: "Venció", degradado: "Sin confirmar" };

export function AlertsCenter() {
  const { accounts, user } = useSession();
  const { places } = usePlaces();
  const remote = accounts && !!user;
  const notices = useQuery({ queryKey: ["notices"], queryFn: () => api<NoticeRow[]>("/notices"), enabled: remote });
  const targets: Target[] = places.length ? places.map(toTarget) : [CENTER];

  return (
    <div className="mx-auto grid max-w-3xl gap-6 pt-2">
      <h1 className="display-title text-4xl">Alertas</h1>

      <Glass className="divide-y divide-border">
        {targets.map((t) => <Row key={t.id} t={t} />)}
      </Glass>

      {remote && (
        <section className="grid gap-2">
          <SectionTitle title="Historial" />
          {notices.isLoading && <Skeleton className="h-24" />}
          {notices.data?.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hubo avisos.</p>}
          {!!notices.data?.length && (
            <Glass className="divide-y divide-border text-sm">
              {notices.data.map((n) => (
                <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn("size-2 shrink-0 rounded-full", DOT[n.level])} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{STATE[n.state] ?? n.state}{n.shadow ? " · no enviado" : ""} · {ago(n.last_changed)}</span>
                </div>
              ))}
            </Glass>
          )}
        </section>
      )}
    </div>
  );
}

function Row({ t }: { t: Target }) {
  const { data, isLoading, isError } = useRisk({ lat: t.lat, lon: t.lon });
  const v = data?.verdict;
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t.label}</p>
        {v && <p className="truncate text-sm text-muted-foreground">{v.line}{v.basis === "oficial" && v.from ? ` · ${whenRange(v.from, v.to)}` : ""}</p>}
        {isError && <p className="text-sm text-muted-foreground">No pudimos consultar</p>}
      </div>
      {isLoading ? <Skeleton className="h-6 w-20" /> : v && (
        <span className="flex items-center gap-2 text-sm font-medium" title={data ? `Actualizado ${fmtDateTime(data.generatedAt)}` : undefined}>
          <span className={cn("size-2.5 rounded-full", DOT[v.level])} aria-hidden />
          {v.word}
        </span>
      )}
    </div>
  );
}
