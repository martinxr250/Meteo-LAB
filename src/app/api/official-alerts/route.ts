import { COVERAGE } from "@/lib/geo";
import { limited } from "@/server/core/respond";
import { fetchOfficialAlerts } from "@/server/modules/sources/official";
import { SMN_ATTRIBUTION } from "@/server/modules/sources/smn-cap";

export const maxDuration = 30;

/** Alertas oficiales vigentes como GeoJSON. `?scope=pais` devuelve todo el país; por defecto, el área de cobertura. */
export async function GET(request: Request) {
  const tooMany = limited(request, "official", 60);
  if (tooMany) return tooMany;
  const scope = new URL(request.url).searchParams.get("scope") === "pais" ? "pais" : "area";
  const { alerts, status } = await fetchOfficialAlerts();
  const b = COVERAGE.bbox;
  const touches = (ring: [number, number][]) => ring.some(([x, y]) => x >= b.minLon - 1 && x <= b.maxLon + 1 && y >= b.minLat - 1 && y <= b.maxLat + 1);
  const features = alerts
    .filter((a) => scope === "pais" || a.polygons.some((p) => touches(p[0])))
    .flatMap((a) =>
      a.polygons.map((p, i) => ({
        type: "Feature" as const,
        id: `${a.id}#${i}`,
        geometry: { type: "Polygon" as const, coordinates: p },
        properties: {
          id: a.id, product: a.product, event: a.event, headline: a.headline, color: a.color, colorFrom: a.colorFrom,
          severity: a.severity, certainty: a.certainty, onset: a.onset, expires: a.expires, sent: a.sent, web: a.web,
          areaDesc: a.areaDesc, phenomena: a.phenomena.join(","),
        },
      })),
    );
  return Response.json(
    { type: "FeatureCollection", features, attribution: SMN_ATTRIBUTION, status },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60" } },
  );
}
