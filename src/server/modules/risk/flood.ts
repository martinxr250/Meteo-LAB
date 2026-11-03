import type { Level, PhenomenonAssessment } from "@/lib/domain";
import type { EnsembleSeries, ForecastSeries } from "../sources/open-meteo";
import { combineSystems, exceedanceBySystem } from "./rain";

/*
 * Anegamientos — se separan dos cosas:
 *  1. Susceptibilidad estática del lugar: hoy solo un indicador topográfico (DEM Copernicus 90 m):
 *     diferencia entre la cota del punto y el promedio de 8 vecinos a ~400 m (TPI). No es un mapa de inundación.
 *  2. Peligro dinámico: lluvia antecedente (72 h, MODELADA, no medida) + probabilidad de lluvia fuerte prevista.
 * No se convierte una probabilidad de lluvia en probabilidad de anegamiento: se informan "condiciones favorables".
 * Crecidas de ríos y arroyos: sin pronóstico hidrológico disponible para la Capital → no se estiman.
 */
export const FLOOD_MODEL_VERSION = "anegamiento-condiciones-v0.1 (regla, sin calibrar)";

export function topographicIndex(elev: number[] | null) {
  if (!elev || elev.length < 9 || elev.some((e) => !Number.isFinite(e))) return null;
  const [c, ...n] = elev;
  const tpi = c - n.reduce((a, b) => a + b, 0) / n.length;
  const relief = Math.max(...n) - Math.min(...n);
  return { tpi, relief, low: tpi <= -3 };
}

export function antecedentMm(fc: ForecastSeries, now: Date, hours = 72) {
  let s = 0, n = 0;
  for (let i = 0; i < fc.time.length; i++) {
    const t = new Date(fc.time[i]).getTime();
    if (t <= now.getTime() && t > now.getTime() - hours * 3_600_000 && fc.precipitation[i] != null) {
      s += fc.precipitation[i]!;
      n++;
    }
  }
  return n >= hours * 0.8 ? s : null;
}

export function floodLevel(p3h30: number | null, p24h50: number | null, antecedent: number | null, low: boolean | null): Level {
  if (p3h30 == null && p24h50 == null) return "sin_datos";
  let score = 0;
  if ((p3h30 ?? 0) >= 0.3) score += 2;
  else if ((p3h30 ?? 0) >= 0.1) score += 1;
  if ((p24h50 ?? 0) >= 0.3) score += 1;
  if ((antecedent ?? 0) >= 40) score += 1;
  if (low) score += 1;
  if (score >= 4) return "alto";
  if (score >= 2) return "atento";
  return "bajo";
}

export function assessFlood(fc: ForecastSeries | null, ens: EnsembleSeries | null, elev: number[] | null, now: Date, issuedAt: string | null): PhenomenonAssessment {
  const topo = topographicIndex(elev);
  const antecedent = fc ? antecedentMm(fc, now) : null;
  const p3h30 = ens ? combineSystems(exceedanceBySystem(ens, now, 24, 3, 30)) : null;
  const p24h50 = ens ? combineSystems(exceedanceBySystem(ens, now, 24, 24, 50)) : null;
  const level = floodLevel(p3h30, p24h50, antecedent, topo?.low ?? null);
  const parts: string[] = [];
  if (antecedent != null) parts.push(`lluvia modelada de las últimas 72 h: ${antecedent.toFixed(0)} mm`);
  if (p3h30 != null) parts.push(`chance de ≥ 30 mm en 3 h: ${Math.round(p3h30 * 100)} %`);
  if (topo) parts.push(topo.low ? `el punto está ${Math.abs(topo.tpi).toFixed(0)} m por debajo de su entorno` : "el punto no está en un bajo topográfico marcado");

  return {
    phenomenon: "anegamiento",
    kind: "estimacion",
    level,
    probability: null,
    metric: "Condiciones favorables (no es probabilidad de anegamiento)",
    window: { from: now.toISOString(), to: new Date(now.getTime() + 24 * 3_600_000).toISOString() },
    indicator: [
      antecedent != null ? `72 h previas: ${antecedent.toFixed(0)} mm` : null,
      p3h30 != null ? `≥30 mm/3 h ${Math.round(p3h30 * 100)} %` : null,
      topo ? (topo.low ? `bajo topográfico (${topo.tpi.toFixed(0)} m)` : "sin bajo topográfico") : null,
    ].filter(Boolean).join(" · ") || "Sin datos",
    summary:
      level === "sin_datos"
        ? "No hay datos suficientes para evaluar condiciones de anegamiento."
        : `${level === "bajo" ? "Condiciones poco favorables" : "Condiciones favorables"} para anegamientos urbanos. ${parts.join("; ")}.`,
    method:
      "Regla que combina lluvia fuerte prevista en ensambles, lluvia antecedente modelada y un indicador topográfico del DEM Copernicus 90 m (TPI a ~400 m).",
    uncertainty:
      "No conocemos el estado del drenaje ni los puntos críticos municipales; no estimamos anegamiento por calle. Crecidas de ríos y arroyos: sin pronóstico hidrológico disponible, no se estiman.",
    inputs: [
      { source: "Open-Meteo ensambles", issuedAt },
      { source: "Open-Meteo best_match (72 h previas, modelado)", issuedAt },
      { source: "Copernicus DEM GLO-90 vía Open-Meteo", issuedAt: null, detail: topo ? `TPI ${topo.tpi.toFixed(1)} m, relieve ${topo.relief.toFixed(0)} m` : "no disponible" },
    ],
    abstained: level === "sin_datos" ? "Ensamble no disponible" : undefined,
    modelVersion: FLOOD_MODEL_VERSION,
  };
}
