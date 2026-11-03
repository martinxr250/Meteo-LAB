import type { Level, OfficialAlert, PhenomenonAssessment } from "@/lib/domain";
import type { EnsembleSeries, ForecastSeries } from "../sources/open-meteo";
import { exceedanceBySystem, combineSystems } from "./rain";

/*
 * Granizo — CONDICIONES FAVORABLES, no probabilidad de granizo en superficie.
 * No hay etiquetas públicas verificadas de granizo en superficie para Córdoba, así que no se puede
 * entrenar ni calibrar un modelo de ocurrencia. Este índice suma ingredientes físicos conocidos:
 *   inestabilidad (CAPE), nivel de congelación bajo, disparo convectivo y el diagnóstico de granizo del modelo.
 * Distinción explícita: una señal en altura (radar) o condiciones favorables NO equivalen a granizo confirmado.
 */
export const HAIL_MODEL_VERSION = "granizo-ingredientes-v0.1 (regla, sin calibrar)";

export function hailIngredients(fc: ForecastSeries, ens: EnsembleSeries | null, now: Date, hours = 24) {
  const i0 = Math.max(0, fc.time.findIndex((t) => new Date(t) >= now));
  const i1 = Math.min(fc.time.length, i0 + hours);
  const slice = <T,>(a: (T | null)[]) => a.slice(i0, i1).filter((v): v is T => v != null);
  const cape = slice(fc.cape);
  const fz = slice(fc.freezing_level_height);
  const codes = slice(fc.weather_code);
  const precip = slice(fc.precipitation);
  if (!cape.length) return null;

  const capeMax = Math.max(...cape);
  const fzMin = fz.length ? Math.min(...fz) : null;
  const trigger = ens ? combineSystems(exceedanceBySystem(ens, now, hours, 1, 5)) : null;
  const modelHail = codes.some((c) => c === 96 || c === 99);
  const detPrecipMax = precip.length ? Math.max(...precip) : 0;

  let score = 0;
  const why: string[] = [];
  if (capeMax >= 2000) { score += 2; why.push(`inestabilidad alta (CAPE máx. ${Math.round(capeMax)} J/kg)`); }
  else if (capeMax >= 1000) { score += 1; why.push(`inestabilidad moderada (CAPE máx. ${Math.round(capeMax)} J/kg)`); }
  if (fzMin != null && fzMin <= 4200) { score += 1; why.push(`nivel de congelación bajo (${Math.round(fzMin)} m)`); }
  const triggered = (trigger != null && trigger >= 0.2) || detPrecipMax >= 5;
  if (triggered) { score += 1; why.push("los modelos muestran convección (lluvia ≥ 5 mm/h)"); }
  if (modelHail) { score += 1; why.push("el modelo diagnostica tormenta con granizo"); }
  return { score, capeMax, fzMin, trigger, modelHail, triggered, why, window: { from: fc.time[i0], to: fc.time[i1 - 1] } };
}

export function hailLevel(score: number, triggered: boolean): Level {
  // Sin disparo convectivo, la inestabilidad sola no alcanza para subir el nivel.
  if (!triggered) return "bajo";
  if (score >= 4) return "alto";
  if (score >= 2) return "atento";
  return "bajo";
}

export function assessHail(fc: ForecastSeries | null, ens: EnsembleSeries | null, official: OfficialAlert[], now: Date, issuedAt: string | null): PhenomenonAssessment {
  const officialHail = official.some((a) => a.phenomena.includes("granizo"));
  const base = {
    phenomenon: "granizo" as const,
    kind: "estimacion" as const,
    probability: null,
    metric: "Índice de ingredientes 0–5 (no es probabilidad)",
    method:
      "Suma de ingredientes en las próximas 24 h sobre la celda del modelo: CAPE ≥ 1000/2000 J/kg, nivel de congelación ≤ 4200 m, " +
      "disparo convectivo en ensambles (≥ 20 % de miembros con ≥ 5 mm/h) y código de tiempo 96/99 del modelo.",
    modelVersion: HAIL_MODEL_VERSION,
  };
  const ing = fc ? hailIngredients(fc, ens, now) : null;
  if (!ing) {
    return {
      ...base,
      level: "sin_datos",
      window: null,
      summary: officialHail
        ? "No pudimos calcular las condiciones propias, pero hay un aviso oficial que menciona granizo en esta zona."
        : "No pudimos obtener los datos de inestabilidad. No es posible estimar condiciones de granizo.",
      uncertainty: "Sin datos.",
      inputs: [],
      abstained: "Pronóstico de inestabilidad no disponible",
    };
  }
  const level = hailLevel(ing.score, ing.triggered);
  return {
    ...base,
    level,
    window: ing.window,
    summary:
      level === "bajo"
        ? `Condiciones poco favorables para granizo en las próximas 24 h${ing.why.length ? ` (${ing.why.join("; ")})` : ""}.`
        : `Condiciones favorables para tormentas con granizo: ${ing.why.join("; ")}. No indica que vaya a granizar en tu ubicación exacta.`,
    uncertainty:
      "Regla sin calibrar: no hay registros verificados de granizo en superficie para medir aciertos. El granizo es muy local (cientos de metros) y los modelos tienen celdas de 9–25 km.",
    inputs: [
      { source: "Open-Meteo best_match (CAPE, nivel de congelación, código de tiempo)", issuedAt },
      { source: "Open-Meteo ensambles (disparo convectivo)", issuedAt },
    ],
  };
}
