"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/components/providers/session";
import { KindBadge, LevelBadge, OfficialColorBadge } from "@/components/risk/badges";
import { CENTER, toTarget, type Target } from "@/components/risk/place-picker";
import { Glass, Pill, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { usePlaces } from "@/hooks/use-places";
import { useRisk } from "@/hooks/use-risk";
import { api } from "@/lib/api";
import { PHENOMENON_LABEL, type InfoKind, type Level, type Phenomenon } from "@/lib/domain";
import { ago, fmtDateTime, until } from "@/lib/format";

interface NoticeRow {
  id: string; phenomenon: Phenomenon; kind: InfoKind; level: Level; state: string; title: string; body: string; source: string;
  valid_to: string | null; first_seen: string; last_changed: string; shadow: boolean;
  notice_events: { change: string; level: Level; reason: string; at: string }[];
}

const STATE_LABEL: Record<string, string> = { activo: "Activo", resuelto: "Resuelto", vencido: "Vencido", degradado: "Sin confirmar (fuente caída)" };

export function AlertsCenter() {
  const { accounts, user } = useSession();
  const { places } = usePlaces();
  const remote = accounts && !!user;
  const notices = useQuery({ queryKey: ["notices"], queryFn: () => api<NoticeRow[]>("/notices"), enabled: remote });
  const targets: Target[] = places.length ? places.map(toTarget) : [CENTER];

  return (
    <div className="mx-auto grid max-w-5xl gap-6 pt-2">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Centro de alertas</p>
        <h1 className="display-title text-4xl sm:text-5xl">Qué pasa en tus lugares</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Separamos siempre los <strong>avisos oficiales</strong> (SMN, con su nivel y vigencia) de las <strong>estimaciones del sistema</strong>. Una estimación baja nunca oculta un aviso oficial.
        </p>
      </div>

      <section className="grid gap-3">
        <SectionTitle eyebrow="En este momento" title="Estado actual por lugar" />
        {targets.map((t) => <LivePlace key={t.id} t={t} />)}
      </section>

      {remote && (
        <section className="grid gap-3">
          <SectionTitle eyebrow="Historial" title="Avisos y cambios registrados" />
          {notices.isLoading && <Skeleton className="h-32" />}
          {notices.data && !notices.data.length && <p className="text-sm text-muted-foreground">Sin avisos registrados todavía. Se generan en cada corrida programada.</p>}
          {notices.data?.map((n) => (
            <Glass key={n.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={n.kind} extra={n.shadow ? "modo sombra, no enviado" : undefined} />
                <LevelBadge level={n.level} />
                <Pill className="bg-muted text-muted-foreground">{STATE_LABEL[n.state] ?? n.state}</Pill>
              </div>
              <p className="mt-2 font-semibold">{n.title}</p>
              <p className="text-sm text-muted-foreground">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">Primera vez {fmtDateTime(n.first_seen)} · último cambio {ago(n.last_changed)}{n.valid_to ? ` · ${until(n.valid_to)}` : ""}</p>
              {n.notice_events.length > 0 && (
                <ol className="mt-3 grid gap-1 border-l-2 border-border pl-3 text-xs">
                  {[...n.notice_events].sort((a, b) => b.at.localeCompare(a.at)).map((e, i) => (
                    <li key={i}><span className="font-medium">{e.change}</span> → {e.level.replace("_", " ")} · {e.reason} <span className="text-muted-foreground">({fmtDateTime(e.at)})</span></li>
                  ))}
                </ol>
              )}
            </Glass>
          ))}
        </section>
      )}
    </div>
  );
}

function LivePlace({ t }: { t: Target }) {
  const { data, isLoading, isError } = useRisk({ lat: t.lat, lon: t.lon });
  return (
    <Glass className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{t.label}</p>
        {data && <span className="text-xs text-muted-foreground">calculado {ago(data.generatedAt)}</span>}
      </div>
      {isLoading && <Skeleton className="mt-3 h-16" />}
      {isError && <p className="mt-2 text-sm text-lvl-high">No pudimos calcular el estado. No lo interpretes como ausencia de riesgo.</p>}
      {data && (
        <ul className="mt-3 grid gap-2">
          {data.official.filter((o) => (o as { relation?: string }).relation !== "cerca").map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
              <KindBadge kind="oficial" extra="SMN" />
              <OfficialColorBadge color={o.color} />
              <span>{o.headline || o.event}</span>
              <span className="text-xs text-muted-foreground">· {fmtDateTime(o.onset ?? o.sent)} → {fmtDateTime(o.expires)}</span>
            </li>
          ))}
          {data.assessments.map((a) => (
            <li key={a.phenomenon} className="flex flex-wrap items-center gap-2 text-sm">
              <KindBadge kind={a.kind} extra={data.ownEstimatesMode === "shadow" ? "modo sombra" : undefined} />
              <LevelBadge level={a.level} />
              <span>{PHENOMENON_LABEL[a.phenomenon]}</span>
              <span className="text-xs text-muted-foreground">· {a.metric}</span>
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}
