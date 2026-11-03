import { SOURCES } from "@/lib/sources-catalog";
import { problem } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";
import { listModels } from "@/server/modules/risk/calibration";

/** Panel operativo: fuentes, modelos, envíos y auditoría. Requiere rol admin (RLS) y MFA. */
export async function GET(request: Request) {
  const g = await requireUser(request, { mfa: true });
  if (!g.ok) return g.response;
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [runs, deliveries, pending, audit, models] = await Promise.all([
    g.sb.from("source_runs").select("source_id, started_at, ok, items, latency_ms, data_time, error").gte("started_at", since).order("started_at", { ascending: false }).limit(200),
    g.sb.from("deliveries").select("status, latency_ms, created_at").gte("created_at", since).limit(5000),
    g.sb.from("community_reports").select("id, phenomenon, hail_size, lat, lon, observed_at, description, created_at").eq("status", "pendiente").order("created_at").limit(50),
    g.sb.from("audit_log").select("action, entity, entity_id, at, actor").order("at", { ascending: false }).limit(50),
    g.sb.from("model_registry").select("name, version, phenomenon, status, metrics, created_at").order("created_at", { ascending: false }),
  ]);
  if (runs.error) return problem(403, "Sin permiso de administración");
  const d = deliveries.data ?? [];
  const lat = d.map((x) => x.latency_ms).filter((x): x is number => x != null).sort((a, b) => a - b);
  return Response.json({
    runs: runs.data,
    deliveries: {
      total: d.length,
      sent: d.filter((x) => x.status === "enviado").length,
      failed: d.filter((x) => x.status === "fallido").length,
      skipped: d.filter((x) => x.status === "omitido").length,
      p50LatencyMs: lat[Math.floor(lat.length * 0.5)] ?? null,
      p95LatencyMs: lat[Math.floor(lat.length * 0.95)] ?? null,
    },
    pendingReports: pending.data ?? [],
    audit: audit.data ?? [],
    models: { registry: models.data ?? [], bundled: listModels() },
    catalog: SOURCES.map((s) => ({ id: s.id, name: s.name, state: s.state })),
  });
}
