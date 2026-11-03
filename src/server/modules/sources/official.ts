import "server-only";
import type { OfficialAlert, SourceStatus } from "@/lib/domain";
import { fetchSource } from "@/server/core/http";
import { log } from "@/server/core/log";
import { isActive, parseCapAlert, parseCapIndex, SMN_CAP_INDEX } from "./smn-cap";

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>) {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/**
 * Descarga el índice CAP del SMN y cada documento. Las actualizaciones (msgType Update/Cancel)
 * reemplazan al mensaje que referencian: así no se muestran dos versiones del mismo aviso.
 */
export async function fetchOfficialAlerts(now = new Date()): Promise<{ alerts: OfficialAlert[]; status: SourceStatus; rawShas: string[] }> {
  const started = new Date();
  try {
    const index = await fetchSource(SMN_CAP_INDEX, { revalidate: 120, maxBytes: 2_000_000 });
    const links = parseCapIndex(index.body).slice(0, 400);
    let failed = 0;
    const docs = await pool(links, 12, async (url) => {
      try {
        const r = await fetchSource(url, { revalidate: 600, maxBytes: 500_000, timeoutMs: 8_000 });
        return { alert: parseCapAlert(r.body, url), sha: r.sha256 };
      } catch {
        failed++;
        return null;
      }
    });
    const parsed = docs.filter((d): d is { alert: OfficialAlert; sha: string } => !!d?.alert);
    const alerts = supersede(parsed.map((d) => d.alert)).filter((a) => isActive(a, now));
    const newest = parsed.map((d) => d.alert.sent).sort().at(-1) ?? null;
    if (failed) log("warn", "smn_cap.partial", { failed, total: links.length });
    return {
      alerts,
      rawShas: [index.sha256, ...parsed.map((d) => d.sha)],
      status: {
        id: "smn-cap",
        name: "SMN — alertas y avisos",
        ok: failed < links.length / 2,
        fetchedAt: index.fetchedAt,
        dataTime: newest,
        ageMinutes: newest ? Math.round((now.getTime() - new Date(newest).getTime()) / 60_000) : null,
        // Las alertas se emiten dos veces por día: más de 14 h sin emisiones indica un problema del feed.
        stale: newest ? now.getTime() - new Date(newest).getTime() > 14 * 3_600_000 : true,
        error: failed ? `${failed} de ${links.length} documentos no se pudieron leer` : undefined,
      },
    };
  } catch (e) {
    log("error", "smn_cap.failed", { error: String(e) });
    return {
      alerts: [],
      rawShas: [],
      status: { id: "smn-cap", name: "SMN — alertas y avisos", ok: false, fetchedAt: started.toISOString(), dataTime: null, ageMinutes: null, stale: true, error: "No se pudo leer el feed oficial" },
    };
  }
}

/** Quita los mensajes reemplazados por una actualización o cancelación posterior. */
export function supersede(alerts: OfficialAlert[]) {
  const referenced = new Set<string>();
  for (const a of alerts) {
    for (const ref of a.references) {
      // Formato CAP: "sender,identifier,sent"
      const id = ref.split(",")[1];
      if (id) referenced.add(id);
    }
  }
  const seen = new Set<string>();
  return alerts.filter((a) => {
    if (referenced.has(a.id) || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}
