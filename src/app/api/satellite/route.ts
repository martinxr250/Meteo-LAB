import { fetchSource } from "@/server/core/http";
import { problem } from "@/server/core/respond";
import { domainsUrl, GOES_ATTRIBUTION, GOES_LEGEND, parseDomainTimes, tileTemplate } from "@/server/modules/sources/goes";

/** Últimas imágenes infrarrojas del GOES-19 disponibles (hasta 3 h, cada 10 min). */
export async function GET() {
  const now = new Date();
  const from = new Date(now.getTime() - 3 * 3_600_000);
  try {
    const r = await fetchSource(domainsUrl(from, now), { revalidate: 120, maxBytes: 50_000 });
    let frames = parseDomainTimes(r.body);
    // GIBS anuncia la hora antes de terminar de publicar las teselas: se verifican los dos últimos
    // cuadros con la tesela que cubre Córdoba y se descartan los que todavía no existen.
    for (const t of frames.slice(-2).reverse()) {
      const ok = await fetchSource(tileTemplate().replace("{time}", t).replace("{z}/{y}/{x}", "6/37/21"), { revalidate: 300, maxBytes: 500_000 })
        .then(() => true)
        .catch(() => false);
      if (ok) break;
      frames = frames.filter((f) => f !== t);
    }
    if (!frames.length) return problem(503, "Sin imágenes recientes");
    return Response.json(
      { template: tileTemplate(), frames, legend: GOES_LEGEND, attribution: GOES_ATTRIBUTION, fetchedAt: r.fetchedAt },
      { headers: { "Cache-Control": "public, s-maxage=120" } },
    );
  } catch {
    return problem(503, "Satélite no disponible");
  }
}
