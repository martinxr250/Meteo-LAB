/*
 * Modelo de dominio compartido entre servidor y cliente.
 * Regla central: cada dato dice de qué tipo es (oficial, estimación, observación, reporte)
 * y la ausencia de datos se representa como "sin_datos", nunca como "sin riesgo".
 */

export type Phenomenon = "granizo" | "lluvia_intensa" | "anegamiento" | "tormenta" | "viento" | "otro";

export const PHENOMENON_LABEL: Record<Phenomenon, string> = {
  granizo: "Granizo",
  lluvia_intensa: "Lluvia intensa",
  anegamiento: "Anegamientos",
  tormenta: "Tormentas",
  viento: "Viento",
  otro: "Otro fenómeno",
};

/** De dónde sale la información. Se muestra siempre junto al dato. */
export type InfoKind = "oficial" | "estimacion" | "observacion" | "reporte_comunitario";

export const INFO_KIND_LABEL: Record<InfoKind, string> = {
  oficial: "Aviso oficial",
  estimacion: "Estimación del sistema",
  observacion: "Observación medida",
  reporte_comunitario: "Reporte comunitario",
};

/**
 * Nivel de atención. "sin_datos" es explícito: si no pudimos estimar, lo decimos.
 * No existe un nivel "sin riesgo".
 */
export type Level = "sin_datos" | "bajo" | "atento" | "alto" | "muy_alto";

export const LEVEL_ORDER: Record<Level, number> = { sin_datos: -1, bajo: 0, atento: 1, alto: 2, muy_alto: 3 };

export const LEVEL_LABEL: Record<Level, string> = {
  sin_datos: "Sin datos",
  bajo: "Bajo",
  atento: "Atención",
  alto: "Alto",
  muy_alto: "Muy alto",
};

export function maxLevel(levels: Level[]): Level {
  return levels.reduce<Level>((acc, l) => (LEVEL_ORDER[l] > LEVEL_ORDER[acc] ? l : acc), "sin_datos");
}

/** Coordenadas siempre [lon, lat] en WGS84, como GeoJSON. */
export type LonLat = [number, number];
export type Ring = LonLat[];
export type Polygon = Ring[];

/** Nivel de las alertas del SMN (sistema de alerta temprana por colores). */
export type OfficialColor = "amarilla" | "naranja" | "roja";

export interface OfficialAlert {
  /** Identificador CAP tal como lo emite la fuente. */
  id: string;
  source: "SMN";
  /** "alerta" = pronóstico por zonas; "aviso_corto_plazo" = tormenta en curso, vigencia ~1 h. */
  product: "alerta" | "aviso_corto_plazo";
  msgType: "Alert" | "Update" | "Cancel" | string;
  references: string[];
  event: string;
  headline: string;
  description: string;
  instruction: string;
  color: OfficialColor | null;
  /** Cómo se determinó el color: leído del titular o inferido de la severidad CAP. */
  colorFrom: "titular" | "severidad_cap" | null;
  severity: string;
  certainty: string;
  urgency: string;
  sent: string;
  onset: string | null;
  expires: string | null;
  areaDesc: string;
  polygons: Polygon[];
  web: string;
  phenomena: Phenomenon[];
}

export interface SourceStatus {
  id: string;
  name: string;
  ok: boolean;
  fetchedAt: string | null;
  /** Hora del dato más reciente que trajo la fuente (no la hora del pedido). */
  dataTime: string | null;
  ageMinutes: number | null;
  stale: boolean;
  error?: string;
}

/** Una evaluación de un fenómeno en un punto, con todo lo necesario para explicarla. */
export interface PhenomenonAssessment {
  phenomenon: Phenomenon;
  kind: InfoKind;
  level: Level;
  /** Probabilidad 0–1 solo si proviene de un método documentado. Si es una frecuencia sin calibrar, se aclara en `method`. */
  probability: number | null;
  /** Tipo de magnitud que se muestra: "probabilidad calibrada", "frecuencia en el ensamble", "índice de condiciones". */
  metric: string;
  window: { from: string; to: string } | null;
  /** Dato corto para tablas: cifras, sin prosa. */
  indicator: string;
  summary: string;
  method: string;
  uncertainty: string;
  inputs: { source: string; issuedAt: string | null; detail?: string }[];
  /** Si el modelo se abstuvo, por qué. */
  abstained?: string;
  modelVersion: string;
}

export interface Verdict {
  level: Level;
  word: string;
  line: string;
  from: string | null;
  to: string | null;
  basis: "oficial" | "estimacion" | "sin_datos";
  facts: { label: string; value: string }[];
}

export interface PointRisk {
  point: { lat: number; lon: number; snappedTo: number };
  verdict: Verdict;
  generatedAt: string;
  official: OfficialAlert[];
  assessments: PhenomenonAssessment[];
  hourly: HourlyPoint[];
  sources: SourceStatus[];
  degraded: string[];
  /** Las estimaciones propias se calculan en modo sombra hasta su revisión profesional. */
  ownEstimatesMode: "shadow" | "live";
  recommendations: Recommendation[];
}

export interface HourlyPoint {
  time: string;
  precipitation: number | null;
  precipitationProbability: number | null;
  cape: number | null;
  freezingLevel: number | null;
  ensembleP10mm1h: number | null;
  weatherCode: number | null;
  /** Qué se espera en esa hora, en palabras simples. "granizo" siempre significa POSIBLE, nunca confirmado. */
  condition: HourCondition;
  /** La hora cae dentro de un aviso oficial vigente para el lugar. */
  inAlert: boolean;
}

export type HourCondition = "seco" | "lluvia" | "lluvia_fuerte" | "tormenta" | "granizo";

export const HOUR_CONDITION_LABEL: Record<HourCondition, string> = {
  seco: "Sin lluvia",
  lluvia: "Lluvia",
  lluvia_fuerte: "Lluvia fuerte",
  tormenta: "Tormenta",
  granizo: "Granizo posible",
};

export interface Recommendation {
  text: string;
  /** Autoridad que respalda la acción. Nunca recomendaciones sin respaldo. */
  source: string;
  url: string;
}

export type PlaceKind = "casa" | "trabajo" | "auto" | "otro";

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  casa: "Casa",
  trabajo: "Trabajo",
  auto: "Auto",
  otro: "Otro lugar",
};

export interface Place {
  id: string;
  kind: PlaceKind;
  label: string;
  lat: number;
  lon: number;
  /** Para "Dejé el auto acá": vigilancia temporal; vencida se elimina. */
  watchUntil: string | null;
  createdAt: string;
}
