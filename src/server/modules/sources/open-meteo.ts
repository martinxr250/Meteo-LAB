import type { HourlyPoint } from "@/lib/domain";

/*
 * Open-Meteo: agregador de modelos numéricos (no es una fuente independiente de los modelos que sirve).
 * - /v1/forecast con models=best_match combina modelos según la región.
 * - /v1/ensemble: miembros de ECMWF IFS ENS 0.25° (51) y NCEP GEFS 0.25° (31).
 * Licencia de los datos: CC BY 4.0. La API gratuita es solo para uso no comercial;
 * el uso comercial requiere plan pago (ver docs/fuentes/matriz.md).
 */
export const OPEN_METEO_ATTRIBUTION = "Open-Meteo.com (CC BY 4.0) — modelos ECMWF, NCEP y otros";

const HOURLY = ["precipitation", "precipitation_probability", "cape", "lifted_index", "freezing_level_height", "weather_code", "wind_gusts_10m"];

export function forecastUrl(lat: number, lon: number) {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY.join(","),
    timezone: "UTC",
    past_days: "3",
    forecast_days: "2",
    models: "best_match",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function ensembleUrl(lat: number, lon: number) {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "precipitation",
    timezone: "UTC",
    forecast_days: "2",
    models: "ecmwf_ifs025,gfs025",
  });
  return `https://ensemble-api.open-meteo.com/v1/ensemble?${q}`;
}

/** Elevación Copernicus DEM GLO-90 en un punto y 8 vecinos a ~`offsetM` metros. */
export function elevationUrl(lat: number, lon: number, offsetM = 400) {
  const dLat = offsetM / 110_574;
  const dLon = offsetM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const pts: [number, number][] = [[lat, lon]];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (a || b) pts.push([lat + a * dLat, lon + b * dLon]);
  const q = new URLSearchParams({
    latitude: pts.map((p) => p[0].toFixed(5)).join(","),
    longitude: pts.map((p) => p[1].toFixed(5)).join(","),
  });
  return `https://api.open-meteo.com/v1/elevation?${q}`;
}

export interface ForecastSeries {
  time: string[];
  precipitation: (number | null)[];
  precipitation_probability: (number | null)[];
  cape: (number | null)[];
  lifted_index: (number | null)[];
  freezing_level_height: (number | null)[];
  weather_code: (number | null)[];
  wind_gusts_10m: (number | null)[];
}

export function parseForecast(body: string): ForecastSeries {
  const d = JSON.parse(body);
  if (!d?.hourly?.time) throw new Error("Respuesta de pronóstico sin serie horaria");
  const h = d.hourly;
  return {
    time: (h.time as string[]).map((t) => `${t}:00Z`),
    precipitation: h.precipitation ?? [],
    precipitation_probability: h.precipitation_probability ?? [],
    cape: h.cape ?? [],
    lifted_index: h.lifted_index ?? [],
    freezing_level_height: h.freezing_level_height ?? [],
    weather_code: h.weather_code ?? [],
    wind_gusts_10m: h.wind_gusts_10m ?? [],
  };
}

export interface EnsembleSeries {
  time: string[];
  /** Miembros agrupados por sistema de ensamble: no son evidencias independientes entre sí. */
  systems: Record<string, (number | null)[][]>;
}

export function parseEnsemble(body: string): EnsembleSeries {
  const d = JSON.parse(body);
  const h = d?.hourly;
  if (!h?.time) throw new Error("Respuesta de ensamble sin serie horaria");
  const systems: Record<string, (number | null)[][]> = {};
  for (const [key, values] of Object.entries(h)) {
    if (!key.startsWith("precipitation")) continue;
    const system = key.includes("ecmwf") ? "ECMWF-ENS" : key.includes("gefs") || key.includes("gfs") ? "NCEP-GEFS" : "otro";
    (systems[system] ??= []).push(values as (number | null)[]);
  }
  return { time: (h.time as string[]).map((t) => `${t}:00Z`), systems };
}

export function parseElevation(body: string): number[] {
  const d = JSON.parse(body);
  if (!Array.isArray(d?.elevation)) throw new Error("Respuesta de elevación inválida");
  return d.elevation as number[];
}

export function toHourly(f: ForecastSeries, ens: EnsembleSeries | null, from: Date, hours = 24): HourlyPoint[] {
  const out: HourlyPoint[] = [];
  const start = f.time.findIndex((t) => new Date(t) >= new Date(from.getTime() - 3_600_000));
  if (start < 0) return out;
  for (let i = start; i < Math.min(f.time.length, start + hours); i++) {
    const t = f.time[i];
    let p10: number | null = null;
    if (ens) {
      const j = ens.time.indexOf(t);
      if (j >= 0) {
        const members = Object.values(ens.systems).flat().map((m) => m[j]).filter((v): v is number => v != null);
        if (members.length) p10 = members.filter((v) => v >= 10).length / members.length;
      }
    }
    out.push({
      time: t,
      precipitation: f.precipitation[i] ?? null,
      precipitationProbability: f.precipitation_probability[i] ?? null,
      cape: f.cape[i] ?? null,
      freezingLevel: f.freezing_level_height[i] ?? null,
      ensembleP10mm1h: p10,
    });
  }
  return out;
}
