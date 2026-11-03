import type { LonLat, Polygon, Ring } from "./domain";

/** Córdoba Capital y alrededores: área de cobertura inicial. */
export const COVERAGE = {
  name: "Córdoba Capital y alrededores",
  center: { lat: -31.4167, lon: -64.1833 },
  // Caja amplia (~120 km) que incluye Gran Córdoba, Sierras Chicas y Punilla.
  bbox: { minLon: -64.9, minLat: -32.0, maxLon: -63.5, maxLat: -30.8 },
} as const;

export function inCoverage(lat: number, lon: number) {
  const b = COVERAGE.bbox;
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
}

/**
 * Ajusta una coordenada a una grilla. Se usa para:
 *  - no enviar la ubicación exacta de una persona a terceros,
 *  - no fabricar precisión: los modelos globales tienen celdas de 9–25 km.
 */
export function snap(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function snapPoint(lat: number, lon: number, step = 0.05) {
  return { lat: Number(snap(lat, step).toFixed(4)), lon: Number(snap(lon, step).toFixed(4)), step };
}

/** Redondeo para almacenamiento: 3 decimales ≈ 110 m, suficiente frente a la resolución de los datos. */
export function coarsen(value: number, decimals = 3) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Ray casting sobre un anillo [lon, lat]. */
export function pointInRing([x, y]: LonLat, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** El primer anillo es el exterior, los demás son huecos. */
export function pointInPolygon(p: LonLat, polygon: Polygon) {
  if (!polygon.length || !pointInRing(p, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(p, hole));
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Distancia mínima (km) de un punto al borde de un polígono, aproximada por vértices y segmentos. */
export function distanceToPolygonKm(p: LonLat, polygon: Polygon) {
  if (pointInPolygon(p, polygon)) return 0;
  let best = Infinity;
  const ring = polygon[0] ?? [];
  const kx = 111.32 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110.57;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][0] - p[0]) * kx, ay = (ring[i][1] - p[1]) * ky;
    const bx = (ring[i + 1][0] - p[0]) * kx, by = (ring[i + 1][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function isValidLatLon(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
