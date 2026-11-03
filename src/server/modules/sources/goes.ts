/*
 * Satélite GOES-19 (posición GOES-East), banda 13 infrarroja limpia (10,3 µm), vía NASA GIBS.
 * WMTS público y documentado: https://nasa-gibs.github.io/gibs-api-docs/
 * Cada 10 min, ~2 km, demora ~40 min. Muestra la temperatura del tope de las nubes:
 * cuanto más frío, más alto y más intenso el núcleo de la tormenta. NO es radar: no ve la lluvia ni el granizo.
 */
export const GOES_LAYER = "GOES-East_ABI_Band13_Clean_Infrared";
export const GOES_ATTRIBUTION = "NASA GIBS / NOAA GOES-19";
const BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export function tileTemplate() {
  return `${BASE}/${GOES_LAYER}/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
}

/** DescribeDomains: rango de horas disponibles entre `from` y `to`. */
export function domainsUrl(from: Date, to: Date) {
  const f = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  return `${BASE}/1.0.0/${GOES_LAYER}/default/GoogleMapsCompatible_Level6/all/${f(from)}--${f(to)}.xml`;
}

/** "inicio/fin/PT10M" (puede haber varios tramos separados por coma) → horas disponibles. */
export function parseDomainTimes(xml: string, max = 18): string[] {
  const m = xml.match(/<Domain>([^<]+)<\/Domain>/);
  if (!m) return [];
  const times: string[] = [];
  for (const part of m[1].split(",")) {
    const [start, end, period] = part.trim().split("/");
    if (!end) {
      if (/^\d{4}-/.test(start)) times.push(start);
      continue;
    }
    const step = Number(period?.match(/PT(\d+)M/)?.[1] ?? 10) * 60_000;
    for (let t = new Date(start).getTime(); t <= new Date(end).getTime(); t += step) times.push(new Date(t).toISOString().slice(0, 19) + "Z");
  }
  return times.sort().slice(-max);
}

/** Leyenda de la paleta oficial de GIBS (Clean_Longwave_Infrared_Window_Band), muestreada en °C. */
export const GOES_LEGEND = [
  { c: -80, rgb: "230,230,230" },
  { c: -70, rgb: "26,0,0" },
  { c: -65, rgb: "153,0,0" },
  { c: -60, rgb: "255,26,0" },
  { c: -55, rgb: "255,153,0" },
  { c: -50, rgb: "230,255,0" },
  { c: -45, rgb: "102,255,0" },
  { c: -40, rgb: "0,234,10" },
  { c: -35, rgb: "0,128,58" },
  { c: -30, rgb: "0,0,115" },
  { c: -20, rgb: "0,242,248" },
  { c: 0, rgb: "148,148,148" },
  { c: 20, rgb: "96,96,96" },
];
