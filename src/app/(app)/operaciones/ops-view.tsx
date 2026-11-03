"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Glass, Pill, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { ago, fmtDateTime } from "@/lib/format";

interface Ops {
  runs: { source_id: string; started_at: string; ok: boolean; items: number; latency_ms: number | null; data_time: string | null; error: string | null }[];
  deliveries: { total: number; sent: number; failed: number; skipped: number; p50LatencyMs: number | null; p95LatencyMs: number | null };
  pendingReports: { id: string; phenomenon: string; hail_size: string | null; lat: number; lon: number; observed_at: string; description: string | null }[];
  audit: { action: string; entity: string; entity_id: string; at: string }[];
  models: { registry: { name: string; version: string; status: string }[]; bundled: { name: string; version: string; status: string }[] };
  catalog: { id: string; name: string; state: string }[];
}

export function OpsView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ops"], queryFn: () => api<Ops>("/ops"), retry: false });
  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "aprobado" | "rechazado" }) => api(`/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops"] }),
  });

  if (q.isLoading) return <Skeleton className="mx-auto mt-4 h-64 max-w-6xl" />;
  if (q.isError) return <Glass className="mx-auto mt-4 max-w-3xl p-5 text-sm">{q.error.message}</Glass>;
  const d = q.data!;
  const last = new Map<string, Ops["runs"][number]>();
  for (const r of d.runs) if (!last.has(r.source_id)) last.set(r.source_id, r);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 pt-2">
      <h1 className="display-title text-4xl sm:text-5xl">Panel operativo</h1>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...last.values()].map((r) => (
          <Glass key={r.source_id} className="p-4">
            <p className="text-sm font-semibold">{r.source_id}</p>
            <Pill className={r.ok ? "mt-2 bg-success/15 text-success" : "mt-2 bg-lvl-severe/15 text-lvl-severe"}>{r.ok ? "OK" : "Falla"}</Pill>
            <p className="mt-2 text-xs text-muted-foreground">Corrida {ago(r.started_at)} · {r.items} ítems · {r.latency_ms ?? "—"} ms</p>
            <p className="text-xs text-muted-foreground">Dato más reciente: {ago(r.data_time)}</p>
            {r.error && <p className="mt-1 text-xs text-lvl-severe">{r.error}</p>}
          </Glass>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <Glass className="p-5"><p className="text-xs text-muted-foreground">Envíos 24 h</p><p className="display-figure mt-1 text-4xl">{d.deliveries.sent}<span className="text-muted-foreground">/{d.deliveries.total}</span></p></Glass>
        <Glass className="p-5"><p className="text-xs text-muted-foreground">Fallidos · omitidos</p><p className="display-figure mt-1 text-4xl">{d.deliveries.failed} · {d.deliveries.skipped}</p></Glass>
        <Glass className="p-5"><p className="text-xs text-muted-foreground">Latencia dato → envío (p50 / p95)</p><p className="display-figure mt-1 text-4xl">{d.deliveries.p50LatencyMs ? Math.round(d.deliveries.p50LatencyMs / 1000) : "—"} / {d.deliveries.p95LatencyMs ? Math.round(d.deliveries.p95LatencyMs / 1000) : "—"} s</p></Glass>
      </section>
      <section className="grid gap-3">
        <SectionTitle title={`Reportes pendientes (${d.pendingReports.length})`} />
        {d.pendingReports.map((r) => (
          <Glass key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-medium">{r.phenomenon}{r.hail_size ? ` · ${r.hail_size}` : ""}</p>
              <p className="text-xs text-muted-foreground">{fmtDateTime(r.observed_at)} · {r.lat}, {r.lon}</p>
              {r.description && <p className="mt-1">{r.description}</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => moderate.mutate({ id: r.id, status: "aprobado" })}>Aprobar</Button>
              <Button size="sm" variant="destructive" onClick={() => moderate.mutate({ id: r.id, status: "rechazado" })}>Rechazar</Button>
            </div>
          </Glass>
        ))}
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <Glass className="p-5">
          <SectionTitle title="Modelos" />
          <ul className="mt-3 grid gap-1 text-sm">
            {[...d.models.bundled, ...d.models.registry].map((m, i) => <li key={i}>{m.name} {m.version} · <strong>{m.status}</strong></li>)}
            {!d.models.bundled.length && !d.models.registry.length && <li className="text-muted-foreground">Ningún modelo promovido: se usan reglas y frecuencias de ensamble.</li>}
          </ul>
        </Glass>
        <Glass className="p-5">
          <SectionTitle title="Auditoría" />
          <ul className="mt-3 grid gap-1 text-xs">
            {d.audit.map((a, i) => <li key={i}>{fmtDateTime(a.at)} · {a.action} {a.entity} {a.entity_id?.slice(0, 8)}</li>)}
          </ul>
        </Glass>
      </section>
    </div>
  );
}
