import { z } from "zod";
import registry from "./models/registry.json";

/*
 * Modelos exportados por ml/ como JSON (coeficientes), nunca como pickle u otro formato ejecutable:
 * un artefacto de modelo no puede ejecutar código al cargarse.
 * Solo se usan los modelos con status "promoted"; los "shadow" se registran pero no se aplican.
 */
export interface LogisticModel {
  name: string;
  version: string;
  status: "shadow" | "candidate" | "promoted" | "retired";
  features: string[];
  coef: number[];
  intercept: number;
  /** Rango de entrenamiento por variable: fuera de rango, el modelo se abstiene. */
  ranges: Record<string, [number, number]>;
  metrics?: Record<string, unknown>;
}

// El registro es un artefacto generado por ml/: se valida en tiempo de ejecución; si no cumple, no se usa ningún modelo.
const Schema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      version: z.string(),
      status: z.enum(["shadow", "candidate", "promoted", "retired"]),
      features: z.array(z.string()),
      coef: z.array(z.number()),
      intercept: z.number(),
      ranges: z.record(z.string(), z.tuple([z.number(), z.number()])),
      metrics: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});
const parsed = Schema.safeParse(registry);
const MODELS: LogisticModel[] = parsed.success ? parsed.data.models : [];

export function loadPromotedModel(name: string): LogisticModel | null {
  const m = MODELS.find((x) => x.name === name && x.status === "promoted");
  if (!m || m.coef.length !== m.features.length || !m.coef.every(Number.isFinite)) return null;
  return m;
}

export function listModels() {
  return MODELS;
}

export function applyCalibration(m: LogisticModel, x: Record<string, number>): number | null {
  let z = m.intercept;
  for (let i = 0; i < m.features.length; i++) {
    const f = m.features[i];
    const v = x[f];
    if (v == null || !Number.isFinite(v)) return null;
    const r = m.ranges[f];
    if (r && (v < r[0] || v > r[1])) return null;
    z += m.coef[i] * v;
  }
  return 1 / (1 + Math.exp(-z));
}
