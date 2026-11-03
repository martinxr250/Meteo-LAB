import { COVERAGE } from "@/lib/geo";
import { assessPoint } from "@/server/modules/risk/assess";

export const maxDuration = 30;

/** Estado de actualización de las fuentes, evaluado sobre el centro de la cobertura. */
export async function GET() {
  const r = await assessPoint(COVERAGE.center.lat, COVERAGE.center.lon);
  return Response.json({ generatedAt: r.generatedAt, sources: r.sources, degraded: r.degraded, ownEstimatesMode: r.ownEstimatesMode }, { headers: { "Cache-Control": "public, s-maxage=120" } });
}
