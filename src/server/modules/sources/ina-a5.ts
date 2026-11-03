/*
 * INA — Sistema de alerta (a5): https://alerta.ina.gob.ar/a5
 * Probado el 2026-11-02 sin credenciales: /obs/puntual/series?var_id=1 lista series de precipitación diaria (12Z→12Z)
 * y /obs/puntual/series/{id}/observaciones devuelve valores. Incluye pluviómetros de la Red Hidrológica Nacional (RHN-SAT)
 * en el área del radar RMA1 (Bosque Alegre, Falda del Carmen, Pilar), Jesús María y Santa Sabina.
 * Uso: etiquetas de lluvia acumulada diaria para evaluar pronósticos. Términos de uso a confirmar con el INA.
 */
export const INA_BASE = "https://alerta.ina.gob.ar/a5";
export const INA_ATTRIBUTION = "Instituto Nacional del Agua (INA) — Red Hidrológica Nacional";

/** Series de precipitación diaria en el Gran Córdoba con datos verificados. */
export const INA_SERIES_CORDOBA = [
  // Coordenadas tal como las publica a5 (estacion.geom). Historial verificado el 2026-11-02.
  { seriesId: 33354, name: "Jesús María (RHN-SAT)", lat: -30.9769, lon: -64.1394, since: "2023-01-11" },
  { seriesId: 39490, name: "Bosque Alegre (RHN-SAT, RMA1)", lat: -31.5975, lon: -64.5503, since: "2024-07-03" },
  { seriesId: 39491, name: "Falda del Carmen (RHN-SAT, RMA1)", lat: -31.5214, lon: -64.4656, since: "2024-07-03" },
  { seriesId: 39493, name: "Pilar (RHN-SAT, RMA1)", lat: -31.6678, lon: -63.8817, since: "2024-07-03" },
  { seriesId: 39510, name: "Santa Sabina (RHN-SAT)", lat: -30.8558, lon: -64.3086, since: "2024-07-03" },
] as const;

export function observationsUrl(seriesId: number, from: Date, to: Date) {
  const q = new URLSearchParams({ timestart: from.toISOString().slice(0, 10), timeend: to.toISOString().slice(0, 10), format: "json" });
  return `${INA_BASE}/obs/puntual/series/${seriesId}/observaciones?${q}`;
}

export interface DailyRain {
  seriesId: number;
  /** Fin del período de acumulación (12 UTC). */
  timeend: string;
  timestart: string;
  mm: number;
}

export function parseObservations(body: string): DailyRain[] {
  const rows = JSON.parse(body);
  if (!Array.isArray(rows)) throw new Error("Respuesta INA inesperada");
  return rows
    .filter((r) => typeof r?.valor === "number" && Number.isFinite(r.valor))
    .map((r) => ({ seriesId: r.series_id, timestart: r.timestart, timeend: r.timeend, mm: r.valor }));
}
