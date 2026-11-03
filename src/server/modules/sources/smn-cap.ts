import { XMLParser } from "fast-xml-parser";
import type { OfficialAlert, OfficialColor, Phenomenon, Polygon } from "@/lib/domain";

/*
 * SMN — Alertas y avisos a corto plazo en formato CAP 1.2.
 * Índice RSS: https://ssl.smn.gob.ar/CAP/AR.php (licencia CC BY 4.0, atribución "Servicio Meteorológico Nacional").
 * Cada ítem enlaza un documento CAP con un polígono propio. Verificado con muestras reales (2026-11-02).
 */
export const SMN_CAP_INDEX = "https://ssl.smn.gob.ar/CAP/AR.php";
export const SMN_ATTRIBUTION = "Servicio Meteorológico Nacional (SMN), CC BY 4.0";

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  // Defensa ante XML hostil: sin DTD externa (fast-xml-parser no la resuelve) y con límites de tamaño aplicados al pedir.
  isArray: (name) => ["item", "info", "area", "polygon"].includes(name),
});

export function parseCapIndex(xml: string): string[] {
  const doc = parser.parse(xml);
  const items: { link?: string; guid?: string }[] = doc?.rss?.channel?.item ?? [];
  const links = items.map((i) => String(i.link ?? i.guid ?? "")).filter((l) => l.startsWith("https://ssl.smn.gob.ar/feeds/CAP/"));
  return [...new Set(links)];
}

/** "lat,lon lat,lon ..." (orden CAP) → anillo GeoJSON [lon, lat], cerrado. */
export function parseCapPolygon(text: string): Polygon | null {
  const ring = text
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map(([lat, lon]) => [lon, lat] as [number, number]);
  if (ring.length < 3) return null;
  const [f, l] = [ring[0], ring[ring.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f);
  // Un anillo válido necesita al menos 3 vértices distintos más el cierre.
  return ring.length >= 4 ? [ring] : null;
}

const COLOR_RE = /\b(AMARILL[OA]|NARANJA|ROJ[OA])\b/i;
function colorFromHeadline(h: string): OfficialColor | null {
  const m = h.match(COLOR_RE)?.[1]?.toLowerCase();
  if (!m) return null;
  if (m.startsWith("amarill")) return "amarilla";
  if (m.startsWith("naranja")) return "naranja";
  return "roja";
}
/** Correspondencia documentada por el SMN entre severidad CAP y color. */
function colorFromSeverity(s: string): OfficialColor | null {
  if (s === "Moderate") return "amarilla";
  if (s === "Severe") return "naranja";
  if (s === "Extreme") return "roja";
  return null;
}

export function phenomenaFromText(text: string): Phenomenon[] {
  const t = text.toLowerCase();
  const out = new Set<Phenomenon>();
  if (/tormenta/.test(t)) out.add("tormenta");
  if (/granizo/.test(t)) out.add("granizo");
  if (/lluvia|precipitaci/.test(t)) out.add("lluvia_intensa");
  if (/inundaci|anegami|crecida/.test(t)) out.add("anegamiento");
  if (/viento|r[áa]faga|zonda/.test(t)) out.add("viento");
  if (!out.size) out.add("otro");
  return [...out];
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

export function parseCapAlert(xml: string, url: string): OfficialAlert | null {
  const doc = parser.parse(xml);
  const a = doc?.alert;
  if (!a) return null;
  const info = (a.info ?? [])[0];
  if (!info) return null;
  const areas: { areaDesc?: string; polygon?: string[] }[] = info.area ?? [];
  const polygons = areas.flatMap((ar) => (ar.polygon ?? []).map((p) => parseCapPolygon(String(p)))).filter((p): p is Polygon => !!p);
  const headline = str(info.headline);
  const description = str(info.description);
  const color = colorFromHeadline(headline) ?? colorFromSeverity(str(info.severity));
  return {
    id: str(a.identifier),
    source: "SMN",
    product: url.includes("/avisocortoplazo/") ? "aviso_corto_plazo" : "alerta",
    msgType: str(a.msgType),
    references: str(a.references).split(/\s+/).filter(Boolean),
    event: str(info.event),
    headline,
    description,
    instruction: str(info.instruction),
    color,
    colorFrom: colorFromHeadline(headline) ? "titular" : color ? "severidad_cap" : null,
    severity: str(info.severity),
    certainty: str(info.certainty),
    urgency: str(info.urgency),
    sent: str(a.sent),
    onset: str(info.onset) || null,
    expires: str(info.expires) || null,
    areaDesc: areas.map((x) => str(x.areaDesc)).filter(Boolean).join(" "),
    polygons,
    web: str(info.web) || url,
    phenomena: phenomenaFromText(`${info.event} ${headline} ${description}`),
  };
}

export function isActive(alert: OfficialAlert, now = new Date()) {
  if (alert.msgType === "Cancel") return false;
  return !alert.expires || new Date(alert.expires) > now;
}
