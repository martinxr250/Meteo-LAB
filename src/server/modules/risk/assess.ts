import "server-only";
import type { OfficialAlert, PhenomenonAssessment, PointRisk, Recommendation, SourceStatus } from "@/lib/domain";
import { distanceToPolygonKm, snapPoint } from "@/lib/geo";
import { env } from "@/server/core/env";
import { fetchSource } from "@/server/core/http";
import { log } from "@/server/core/log";
import { fetchOfficialAlerts } from "../sources/official";
import {
  elevationUrl, ensembleUrl, forecastUrl, parseElevation, parseEnsemble, parseForecast, toHourly,
  type EnsembleSeries, type ForecastSeries,
} from "../sources/open-meteo";
import { assessFlood } from "./flood";
import { assessHail } from "./hail";
import { assessRain } from "./rain";
import { buildVerdict } from "./verdict";

/** Distancia a la que un aviso oficial se informa como "cerca" de un lugar. */
export const NEAR_KM = 15;

export interface MatchedAlert extends OfficialAlert {
  distanceKm: number;
  relation: "dentro" | "cerca";
  /** Zonas vecinas con el mismo aviso (mismo texto, color y vigencia) agrupadas en este. */
  similarNearby: number;
}

/** Firma de contenido: el SMN emite un documento por zona con el mismo texto. */
const signature = (a: OfficialAlert) => [a.product, a.color, a.event, a.description, a.onset, a.expires].join("|");

export function matchAlerts(alerts: OfficialAlert[], lat: number, lon: number): MatchedAlert[] {
  const raw: MatchedAlert[] = [];
  for (const a of alerts) {
    const d = Math.min(...a.polygons.map((p) => distanceToPolygonKm([lon, lat], p)), Infinity);
    if (d <= NEAR_KM) raw.push({ ...a, distanceKm: Number(d.toFixed(1)), relation: d === 0 ? "dentro" : "cerca", similarNearby: 0 });
  }
  // Agrupa por contenido y se queda con el más cercano (si alguno contiene el punto, ese).
  const groups = new Map<string, MatchedAlert>();
  for (const m of raw.sort((x, y) => x.distanceKm - y.distanceKm)) {
    const key = signature(m);
    const g = groups.get(key);
    if (g) g.similarNearby++;
    else groups.set(key, m);
  }
  // Primero los que contienen el punto y los de mayor color.
  const rank = { roja: 3, naranja: 2, amarilla: 1 } as const;
  return [...groups.values()].sort((x, y) => (x.relation === y.relation ? (rank[y.color ?? "amarilla"] ?? 0) - (rank[x.color ?? "amarilla"] ?? 0) : x.relation === "dentro" ? -1 : 1));
}

function status(id: string, name: string, ok: boolean, fetchedAt: string | null, dataTime: string | null, staleAfterH: number, now: Date, error?: string): SourceStatus {
  const age = dataTime ? Math.round((now.getTime() - new Date(dataTime).getTime()) / 60_000) : null;
  return { id, name, ok, fetchedAt, dataTime, ageMinutes: age, stale: !ok || age == null || age > staleAfterH * 60, error };
}

async function tryFetch<T>(url: string, parse: (b: string) => T, revalidate: number) {
  try {
    const r = await fetchSource(url, { revalidate });
    return { value: parse(r.body), fetchedAt: r.fetchedAt, sha: r.sha256, error: undefined as string | undefined };
  } catch (e) {
    log("warn", "source.failed", { url: new URL(url).hostname, error: String(e) });
    return { value: null, fetchedAt: null, sha: null, error: "No disponible" };
  }
}

/** Recomendaciones: solo texto oficial, con su fuente. Si no hay aviso, se remite al SMN. */
export function recommendationsFrom(matched: MatchedAlert[]): Recommendation[] {
  const inside = matched.filter((m) => m.relation === "dentro" && m.instruction);
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const a of inside) {
    if (seen.has(a.instruction)) continue;
    seen.add(a.instruction);
    out.push({ text: a.instruction, source: `SMN — ${a.headline || a.event}`, url: a.web });
  }
  if (!out.length) {
    out.push({
      text: "No hay avisos oficiales vigentes que incluyan este lugar. Ante tormentas, seguí las indicaciones de las autoridades locales y del SMN.",
      source: "Servicio Meteorológico Nacional",
      url: "https://www.smn.gob.ar/alertas",
    });
  }
  return out;
}

export async function assessPoint(
  lat: number,
  lon: number,
  now = new Date(),
  // Permite reutilizar una lectura del feed oficial al evaluar muchos lugares en la misma corrida.
  preloaded?: Awaited<ReturnType<typeof fetchOfficialAlerts>>,
): Promise<PointRisk & { matched: MatchedAlert[]; trace: Record<string, string | null> }> {
  // A los proveedores se envía la celda (~5 km), nunca la ubicación exacta.
  const cell = snapPoint(lat, lon, 0.05);
  const [official, fc, ens, elev] = await Promise.all([
    preloaded ?? fetchOfficialAlerts(now),
    tryFetch<ForecastSeries>(forecastUrl(cell.lat, cell.lon), parseForecast, 900),
    tryFetch<EnsembleSeries>(ensembleUrl(cell.lat, cell.lon), parseEnsemble, 1800),
    // El indicador topográfico usa el punto redondeado a ~110 m: el DEM tiene 90 m.
    tryFetch<number[]>(elevationUrl(Number(lat.toFixed(3)), Number(lon.toFixed(3))), parseElevation, 60 * 60 * 24 * 30),
  ]);

  const matched = matchAlerts(official.alerts, lat, lon);
  const assessments: PhenomenonAssessment[] = [
    assessHail(fc.value, ens.value, matched.filter((m) => m.relation === "dentro"), now, fc.fetchedAt),
    assessRain(ens.value, fc.value, now, ens.fetchedAt),
    assessFlood(fc.value, ens.value, elev.value, now, ens.fetchedAt),
  ];

  const lastFcTime = fc.value ? fc.fetchedAt : null;
  const sources: SourceStatus[] = [
    official.status,
    status("open-meteo-fc", "Pronóstico determinista (Open-Meteo)", !!fc.value, fc.fetchedAt, lastFcTime, 6, now, fc.error),
    status("open-meteo-ens", "Ensambles ECMWF/GEFS (Open-Meteo)", !!ens.value, ens.fetchedAt, ens.fetchedAt, 12, now, ens.error),
    status("dem", "Elevación Copernicus 90 m", !!elev.value, elev.fetchedAt, elev.fetchedAt, 24 * 365, now, elev.error),
  ];
  const degraded = sources.filter((s) => !s.ok || s.stale).map((s) => `${s.name}: ${s.error ?? "datos desactualizados"}`);

  const inside = matched.filter((m) => m.relation === "dentro");
  const hourly = (fc.value ? toHourly(fc.value, ens.value, now, 24) : []).map((h) => {
    const t = new Date(h.time).getTime();
    const covering = inside.filter((a) => new Date(a.onset ?? a.sent).getTime() <= t && (!a.expires || t < new Date(a.expires).getTime()));
    // Si el aviso oficial menciona granizo y el modelo prevé tormenta en esa hora, se marca granizo posible.
    const hail = covering.some((a) => a.phenomena.includes("granizo")) && h.condition === "tormenta";
    return { ...h, inAlert: covering.length > 0, condition: hail ? ("granizo" as const) : h.condition };
  });
  return {
    point: { lat: cell.lat, lon: cell.lon, snappedTo: cell.step },
    verdict: buildVerdict(inside, assessments, hourly),
    generatedAt: now.toISOString(),
    official: matched,
    matched,
    assessments,
    hourly,
    sources,
    degraded,
    ownEstimatesMode: env.OWN_ESTIMATES_MODE,
    recommendations: recommendationsFrom(matched),
    trace: { forecastSha: fc.sha, ensembleSha: ens.sha, elevationSha: elev.sha, capIndexSha: official.rawShas[0] ?? null },
  };
}
