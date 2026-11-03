import { LEVEL_LABEL, PHENOMENON_LABEL, type Level, type OfficialColor, type PhenomenonAssessment } from "@/lib/domain";
import type { MatchedAlert } from "../risk/assess";
import type { Candidate } from "./engine";

const COLOR_LEVEL: Record<OfficialColor, Level> = { amarilla: "atento", naranja: "alto", roja: "muy_alto" };

/** Convierte la evaluación de un lugar en candidatos para el motor. Los avisos oficiales nunca se filtran por el modelo. */
export function candidatesFor(placeId: string, placeLabel: string, matched: MatchedAlert[], assessments: PhenomenonAssessment[]): Candidate[] {
  const out: Candidate[] = [];
  for (const a of matched.filter((m) => m.relation === "dentro")) {
    const phenomenon = a.phenomena.includes("granizo") ? "granizo" : a.phenomena[0] ?? "otro";
    out.push({
      key: `${placeId}:oficial:${a.product}:${phenomenon}`,
      placeId,
      phenomenon,
      kind: "oficial",
      level: a.color ? COLOR_LEVEL[a.color] : "atento",
      title: `${a.product === "aviso_corto_plazo" ? "Aviso a corto plazo" : `Alerta ${a.color ?? ""}`.trim()} — ${placeLabel}`,
      body: `${a.headline || a.event}. ${a.areaDesc ? `Área: ${a.areaDesc}. ` : ""}Fuente: SMN.`,
      source: "SMN",
      validTo: a.expires,
    });
  }
  for (const s of assessments) {
    if (s.level === "sin_datos") continue;
    out.push({
      key: `${placeId}:estimacion:${s.phenomenon}`,
      placeId,
      phenomenon: s.phenomenon,
      kind: "estimacion",
      level: s.level,
      title: `${PHENOMENON_LABEL[s.phenomenon]}: ${LEVEL_LABEL[s.level].toLowerCase()} — ${placeLabel}`,
      body: `${s.summary} (Estimación del sistema, ${s.metric.toLowerCase()}.)`,
      source: s.modelVersion,
      validTo: s.window?.to ?? null,
    });
  }
  return out;
}
