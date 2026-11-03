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

/*
 * Cada documento CAP del SMN tiene una URL única por emisión y no cambia: se guarda en memoria
 * y no se vuelve a pedir. Así la carga sobre el SMN es solo el índice + los documentos nuevos.
 * Si el SMN responde 429 (límite de pedidos), se deja de pedir hasta que pase la pausa.
 */
const DOC_CACHE = new Map<string, { alert: OfficialAlert | null; sha: string }>();
const DOC_CACHE_MAX = 2_000;
let backoffUntil = 0;
let lastGood: { at: number; alerts: OfficialAlert[]; rawShas: string[] } | null = null;

export interface OfficialResult {
  alerts: OfficialAlert[];
  status: SourceStatus;
  rawShas: string[];
  /** true solo si se leyeron TODOS los documentos vigentes: si falta alguno, no se puede afirmar que no hay aviso. */
  complete: boolean;
}

/**
 * Descarga el índice CAP del SMN y los documentos que todavía no tenemos. Las actualizaciones
 * (msgType Update/Cancel) reemplazan al mensaje que referencian.
 */
export async function fetchOfficialAlerts(now = new Date()): Promise<OfficialResult> {
  const started = new Date();
  const fail = (error: string): OfficialResult => {
    // Ante una caída se ofrece la última lectura buena de menos de 1 h, marcada como incompleta.
    const recent = lastGood && now.getTime() - lastGood.at < 3_600_000 ? lastGood : null;
    return {
      alerts: recent ? recent.alerts.filter((a) => isActive(a, now)) : [],
      rawShas: recent?.rawShas ?? [],
      complete: false,
      status: { id: "smn-cap", name: "SMN — alertas y avisos", ok: false, fetchedAt: started.toISOString(), dataTime: null, ageMinutes: null, stale: true, error },
    };
  };
  if (Date.now() < backoffUntil) return fail("El SMN pidió esperar antes de volver a consultar");
  try {
    const index = await fetchSource(SMN_CAP_INDEX, { revalidate: 120, maxBytes: 2_000_000 });
    const links = parseCapIndex(index.body).slice(0, 400);
    let failed = 0;
    let limited = false;
    const docs = await pool(links, 3, async (url) => {
      const cached = DOC_CACHE.get(url);
      if (cached) return cached;
      if (limited) {
        failed++;
        return null;
      }
      try {
        const r = await fetchSource(url, { revalidate: false, maxBytes: 500_000, timeoutMs: 8_000 });
        const entry = { alert: parseCapAlert(r.body, url), sha: r.sha256 };
        if (DOC_CACHE.size >= DOC_CACHE_MAX) DOC_CACHE.delete(DOC_CACHE.keys().next().value!);
        DOC_CACHE.set(url, entry);
        return entry;
      } catch (e) {
        failed++;
        if ((e as { status?: number }).status === 429) {
          limited = true;
          backoffUntil = Date.now() + 5 * 60_000;
        }
        return null;
      }
    });
    const parsed = docs.filter((d): d is { alert: OfficialAlert; sha: string } => !!d?.alert);
    const alerts = supersede(parsed.map((d) => d.alert)).filter((a) => isActive(a, now));
    const newest = parsed.map((d) => d.alert.sent).sort().at(-1) ?? null;
    const rawShas = [index.sha256, ...parsed.map((d) => d.sha)];
    if (failed) log("warn", "smn_cap.partial", { failed, total: links.length, limited });
    else lastGood = { at: now.getTime(), alerts, rawShas };
    return {
      alerts,
      rawShas,
      complete: failed === 0,
      status: {
        id: "smn-cap",
        name: "SMN — alertas y avisos",
        ok: failed === 0,
        fetchedAt: index.fetchedAt,
        dataTime: newest,
        ageMinutes: newest ? Math.round((now.getTime() - new Date(newest).getTime()) / 60_000) : null,
        // Las alertas se emiten dos veces por día: más de 14 h sin emisiones indica un problema del feed.
        stale: newest ? now.getTime() - new Date(newest).getTime() > 14 * 3_600_000 : true,
        error: limited ? "El SMN limitó los pedidos; reintentamos en 5 min" : failed ? `${failed} de ${links.length} avisos no se pudieron leer` : undefined,
      },
    };
  } catch (e) {
    log("error", "smn_cap.failed", { error: String(e) });
    if ((e as { status?: number }).status === 429) backoffUntil = Date.now() + 5 * 60_000;
    return fail("No se pudo leer el feed oficial");
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
