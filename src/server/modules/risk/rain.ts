import type { Level, PhenomenonAssessment } from "@/lib/domain";
import type { EnsembleSeries, ForecastSeries } from "../sources/open-meteo";
import { applyCalibration, loadPromotedModel } from "./calibration";

/*
 * Lluvia intensa — probabilidad de superar umbrales en una ventana.
 * Umbrales PROVISORIOS hasta la revisión meteorológica local (docs/modelos/definiciones.md):
 *   1 h ≥ 10 mm (intensidad), 3 h ≥ 30 mm (chaparrón fuerte), 24 h ≥ 50 mm (acumulación).
 * Los miembros de cada sistema de ensamble se cuentan dentro de su sistema y los sistemas se
 * combinan con igual peso: 51 miembros de ECMWF no valen 51 evidencias frente a 31 de GEFS.
 */
export const RAIN_THRESHOLDS = [
  { id: "1h10", hours: 1, mm: 10, label: "≥ 10 mm en 1 h" },
  { id: "3h30", hours: 3, mm: 30, label: "≥ 30 mm en 3 h" },
  { id: "24h50", hours: 24, mm: 50, label: "≥ 50 mm en 24 h" },
] as const;

export const RAIN_MODEL_VERSION = "lluvia-ensamble-v0.1 (frecuencia sin calibrar)";

/** Máximo de la suma móvil de `hours` horas de un miembro dentro de [i0, i1). */
function maxRolling(values: (number | null)[], i0: number, i1: number, hours: number) {
  let best = 0;
  for (let i = i0; i + hours <= i1; i++) {
    let s = 0;
    for (let k = 0; k < hours; k++) s += values[i + k] ?? 0;
    if (s > best) best = s;
  }
  return best;
}

export function exceedanceBySystem(ens: EnsembleSeries, from: Date, windowHours: number, hours: number, mm: number) {
  const i0 = Math.max(0, ens.time.findIndex((t) => new Date(t) >= from));
  const i1 = Math.min(ens.time.length, i0 + windowHours);
  const out: Record<string, { p: number; n: number }> = {};
  for (const [system, members] of Object.entries(ens.systems)) {
    const valid = members.filter((m) => m.slice(i0, i1).some((v) => v != null));
    if (!valid.length) continue;
    const hits = valid.filter((m) => maxRolling(m, i0, i1, hours) >= mm).length;
    out[system] = { p: hits / valid.length, n: valid.length };
  }
  return out;
}

export function combineSystems(bySystem: Record<string, { p: number }>) {
  const ps = Object.values(bySystem).map((s) => s.p);
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
}

export function rainLevel(p: number | null, severe: boolean): Level {
  if (p == null) return "sin_datos";
  if (p >= 0.6) return severe ? "muy_alto" : "alto";
  if (p >= 0.3) return "alto";
  if (p >= 0.1) return "atento";
  return "bajo";
}

export function assessRain(ens: EnsembleSeries | null, fc: ForecastSeries | null, now: Date, issuedAt: string | null): PhenomenonAssessment {
  const window = { from: now.toISOString(), to: new Date(now.getTime() + 24 * 3_600_000).toISOString() };
  if (!ens || !Object.keys(ens.systems).length) {
    return {
      phenomenon: "lluvia_intensa",
      kind: "estimacion",
      level: "sin_datos",
      probability: null,
      metric: "—",
      window,
      summary: "No pudimos obtener los ensambles de pronóstico. No es posible estimar lluvia intensa ahora.",
      method: RAIN_MODEL_VERSION,
      uncertainty: "Sin datos.",
      inputs: [],
      abstained: "Ensamble no disponible",
      modelVersion: RAIN_MODEL_VERSION,
    };
  }
  const results = RAIN_THRESHOLDS.map((t) => {
    const bySystem = exceedanceBySystem(ens, now, 24, t.hours, t.mm);
    return { ...t, bySystem, p: combineSystems(bySystem) };
  });
  const systemsSpread = results.map((r) => {
    const ps = Object.values(r.bySystem).map((s) => s.p);
    return ps.length > 1 ? Math.max(...ps) - Math.min(...ps) : 0;
  });
  const worst = results.reduce((a, b) => {
    const la = rainLevel(a.p, a.id === "24h50"), lb = rainLevel(b.p, b.id === "24h50");
    return levelRank(lb) > levelRank(la) ? b : a;
  });

  // Calibración diaria (≥ 20 mm/24 h) solo si existe un modelo promovido tras evaluación.
  const promoted = loadPromotedModel("rain-daily");
  let calibrated: number | null = null;
  if (promoted) {
    const p20 = combineSystems(exceedanceBySystem(ens, now, 24, 24, 20));
    if (p20 != null) calibrated = applyCalibration(promoted, { ens_frac_ge20: p20 });
  }

  const level = rainLevel(worst.p, worst.id === "24h50");
  const pct = (p: number | null) => (p == null ? "s/d" : `${Math.round(p * 100)} %`);
  const detail = results.map((r) => `${r.label}: ${pct(r.p)}`).join(" · ");
  const maxDet = fc ? Math.max(0, ...fc.precipitation.filter((v): v is number => v != null)) : null;

  return {
    phenomenon: "lluvia_intensa",
    kind: "estimacion",
    level,
    probability: calibrated ?? worst.p,
    metric: calibrated != null ? `Probabilidad calibrada de ≥ 20 mm/24 h (${promoted!.version})` : `Frecuencia en el ensamble de ${worst.label} (sin calibrar)`,
    window,
    summary:
      level === "bajo"
        ? `Los ensambles muestran señal baja de lluvia intensa en las próximas 24 h. ${detail}.`
        : `Los ensambles muestran posibilidad de lluvia intensa en las próximas 24 h. ${detail}.`,
    method:
      "Fracción de miembros de ECMWF-ENS y NCEP-GEFS (0.25°) que superan cada umbral; cada sistema pesa igual. " +
      (calibrated != null ? "Probabilidad diaria ajustada con regresión logística evaluada contra pluviómetros INA." : "Aún no calibrada contra observaciones locales."),
    uncertainty:
      `Resolución ~25 km: no resuelve tormentas individuales y subestima intensidades de 1 h. Diferencia entre sistemas: hasta ${Math.round(Math.max(...systemsSpread) * 100)} puntos.` +
      (maxDet != null ? ` Máximo horario determinista en la serie: ${maxDet.toFixed(1)} mm.` : ""),
    inputs: [
      { source: "Open-Meteo / ECMWF-ENS", issuedAt, detail: `${results[0].bySystem["ECMWF-ENS"]?.n ?? 0} miembros` },
      { source: "Open-Meteo / NCEP-GEFS", issuedAt, detail: `${results[0].bySystem["NCEP-GEFS"]?.n ?? 0} miembros` },
    ],
    modelVersion: calibrated != null ? promoted!.version : RAIN_MODEL_VERSION,
  };
}

function levelRank(l: Level) {
  return { sin_datos: -1, bajo: 0, atento: 1, alto: 2, muy_alto: 3 }[l];
}
