/*
 * SMN — "Estado del tiempo" (datos abiertos, observaciones horarias de estaciones convencionales).
 * Descarga: https://ssl.smn.gob.ar/dpd/zipopendata.php?dato=tiepre  (ZIP con un .txt en Latin-1, separado por ";").
 * Probado el 2026-11-02: incluye "Córdoba" (Aero), "Córdoba Observatorio", "Pilar Obs.", "Río Cuarto", "Villa Dolores".
 * Limitación: no trae coordenadas; se cruzan con el listado de estaciones (dato=estaciones).
 * No incluye precipitación horaria: sirve como contexto, no como etiqueta de lluvia.
 */
export const SMN_OBS_URL = "https://ssl.smn.gob.ar/dpd/zipopendata.php?dato=tiepre";

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

/** Estaciones SMN dentro del área inicial, con coordenadas del listado oficial (grados y minutos convertidos). */
export const SMN_STATIONS_CORDOBA: Record<string, { lat: number; lon: number; id: string }> = {
  "Córdoba": { id: "87344", lat: -(31 + 17 / 60), lon: -(64 + 12 / 60) },
  "Córdoba Observatorio": { id: "87345", lat: -(31 + 25 / 60), lon: -(64 + 11 / 60) },
  "Pilar Obs.": { id: "87349", lat: -(31 + 40 / 60), lon: -(63 + 53 / 60) },
};

export interface SmnObservation {
  station: string;
  stationId: string | null;
  observedAt: string;
  sky: string;
  visibilityKm: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  wind: string;
  pressureHpa: number | null;
}

function num(s: string | undefined) {
  if (!s) return null;
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Las horas del archivo son hora oficial argentina (UTC−3, sin horario de verano vigente). */
export function parseEstadoTiempo(text: string): SmnObservation[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(";").map((c) => c.trim()))
    .filter((c) => c.length >= 9 && c[1])
    .map((c) => {
      const [d, mName, y] = c[1].split("-");
      const [hh, mm] = c[2].split(":").map(Number);
      const month = MONTHS[mName?.toLowerCase() ?? ""];
      const observedAt = month == null ? "" : new Date(Date.UTC(Number(y), month, Number(d), hh + 3, mm || 0)).toISOString();
      return {
        station: c[0],
        stationId: SMN_STATIONS_CORDOBA[c[0]]?.id ?? null,
        observedAt,
        sky: c[3],
        visibilityKm: num(c[4]?.replace("km", "")),
        temperatureC: num(c[5]),
        humidityPct: num(c[7]),
        wind: c[8],
        pressureHpa: num(c[9]?.split("/")[0]),
      };
    })
    .filter((o) => o.observedAt);
}
