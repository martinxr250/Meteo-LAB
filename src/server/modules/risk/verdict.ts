import { LEVEL_ORDER, type HourlyPoint, type Level, type OfficialAlert, type OfficialColor, type ModelRun, type PhenomenonAssessment, type Verdict } from "@/lib/domain";

/*
 * Respuesta principal para la persona: ¿la tormenta va a ser fuerte en este lugar y cuándo?
 * El aviso oficial manda. Sin aviso, se usan las estimaciones propias, rotuladas como tales.
 */
const COLOR_LEVEL: Record<OfficialColor, Level> = { amarilla: "atento", naranja: "alto", roja: "muy_alto" };
const WORD: Record<Level, string> = { muy_alto: "Muy fuerte", alto: "Fuerte", atento: "Atención", bajo: "Sin tormentas fuertes", sin_datos: "Sin datos" };

/** Datos concretos citados en el texto oficial (sin interpretar más allá de lo escrito). */
export function factsFromOfficial(a: OfficialAlert) {
  const t = `${a.headline} ${a.description}`.toLowerCase();
  const facts: { label: string; value: string }[] = [];
  const rain = t.match(/entre\s+(\d+)\s+y\s+(\d+)\s*mm/);
  if (rain) facts.push({ label: "Lluvia", value: `${rain[1]}–${rain[2]} mm` });
  else if (/lluvia|precipitaci/.test(t)) facts.push({ label: "Lluvia", value: "Abundante" });
  if (/granizo/.test(t)) facts.push({ label: "Granizo", value: "Posible" });
  const gust = t.match(/(\d{2,3})\s*km\/h/);
  if (gust) facts.push({ label: "Ráfagas", value: `> ${gust[1]} km/h` });
  return facts;
}

export function buildVerdict(
  inside: OfficialAlert[],
  assessments: PhenomenonAssessment[],
  hourly: HourlyPoint[],
  run: ModelRun | null = null,
  officialComplete = true,
): Verdict {
  if (inside.length) {
    const rank = (a: OfficialAlert) => (a.color ? LEVEL_ORDER[COLOR_LEVEL[a.color]] : 0);
    const top = [...inside].sort((x, y) => rank(y) - rank(x))[0];
    const level = top.color ? COLOR_LEVEL[top.color] : "atento";
    const event = (top.event || "tormentas").toLowerCase();
    return {
      level,
      word: WORD[level],
      line: `${top.color ? `Alerta ${top.color}` : "Aviso"} del SMN por ${event}`,
      from: top.onset ?? top.sent,
      to: top.expires,
      basis: "oficial",
      facts: factsFromOfficial(top),
      issuedAt: top.sent,
      issuedBy: "SMN",
    };
  }

  const known = assessments.filter((a) => a.level !== "sin_datos");
  if (!officialComplete) {
    // No pudimos leer todos los avisos: no se puede afirmar que no haya uno para este lugar.
    const top = known.reduce<PhenomenonAssessment | null>((a, b) => (!a || LEVEL_ORDER[b.level] > LEVEL_ORDER[a.level] ? b : a), null);
    if (!top || LEVEL_ORDER[top.level] < LEVEL_ORDER.atento) {
      return {
        level: "sin_datos", word: "Sin confirmar", line: "No pudimos leer los avisos del SMN. Consultá smn.gob.ar/alertas",
        from: null, to: null, basis: "sin_datos", facts: [], issuedAt: null, issuedBy: null,
      };
    }
  }
  if (!known.length) {
    return { level: "sin_datos", word: WORD.sin_datos, line: "No pudimos consultar los pronósticos", from: null, to: null, basis: "sin_datos", facts: [], issuedAt: null, issuedBy: null };
  }
  // Las reglas propias no llegan a "muy fuerte": ese nivel queda reservado a avisos oficiales.
  const top = known.reduce((a, b) => (LEVEL_ORDER[b.level] > LEVEL_ORDER[a.level] ? b : a));
  const level: Level = top.level === "muy_alto" ? "alto" : top.level;
  const rain24 = hourly.reduce((s, h) => s + (h.precipitation ?? 0), 0);
  const hail = assessments.find((a) => a.phenomenon === "granizo");
  const flood = assessments.find((a) => a.phenomenon === "anegamiento");
  const wet = hourly.filter((h) => (h.precipitation ?? 0) >= 1);
  return {
    level,
    word: WORD[level],
    line: !officialComplete
      ? "No pudimos leer los avisos del SMN. Estimación propia, en evaluación"
      : level === "bajo" ? "Sin avisos del SMN. Pronóstico estable para las próximas 24 h" : "Sin avisos del SMN. Estimación propia, en evaluación",
    from: wet[0]?.time ?? null,
    to: wet.at(-1)?.time ?? null,
    basis: "estimacion",
    issuedAt: run?.init ?? null,
    issuedBy: run ? `modelo ${run.label}` : null,
    facts: [
      { label: "Lluvia", value: `${rain24 < 1 ? "< 1" : Math.round(rain24)} mm` },
      ...(hail && hail.level !== "sin_datos" ? [{ label: "Granizo", value: hail.level === "bajo" ? "Poco probable" : hail.level === "atento" ? "Condiciones" : "Condiciones favorables" }] : []),
      ...(flood && flood.level !== "sin_datos" ? [{ label: "Anegamientos", value: flood.level === "bajo" ? "Poco probable" : "Posibles" }] : []),
    ],
  };
}
