import { LEVEL_ORDER, type InfoKind, type Level, type Phenomenon } from "@/lib/domain";

/*
 * Motor de decisión de avisos por lugar. Lógica pura y determinista (sin E/S) para poder
 * probarla con escenarios: duplicados, actualizaciones, oscilaciones, vencimientos y caídas de datos.
 *
 * Reglas:
 *  - Clave de deduplicación: lugar + tipo de información + fenómeno (+ producto oficial).
 *  - Subir de nivel notifica de inmediato. Bajar requiere sostenerse HYSTERESIS_MIN (evita parpadeo).
 *  - Un mismo aviso al mismo nivel no se renotifica antes de COOLDOWN_MIN.
 *  - Los avisos oficiales vencen con su `validTo`; las estimaciones se resuelven tras HYSTERESIS_MIN sin señal.
 *  - En modo sombra las estimaciones propias se registran pero no se envían.
 *  - Sin datos no es "resuelto": el estado queda "degradado" y no se informa como "sin riesgo".
 */
export const HYSTERESIS_MIN = 60;
export const COOLDOWN_MIN = 6 * 60;

export type NoticeState = "activo" | "resuelto" | "vencido" | "degradado";

export interface Candidate {
  key: string;
  placeId: string;
  phenomenon: Phenomenon;
  kind: InfoKind;
  level: Level;
  title: string;
  body: string;
  source: string;
  validTo: string | null;
}

export interface Notice extends Candidate {
  state: NoticeState;
  firstSeen: string;
  lastChanged: string;
  lastNotified: string | null;
  lastNotifiedLevel: Level | null;
  /** Desde cuándo el nivel candidato está por debajo del vigente (histéresis). */
  lowerSince: string | null;
  lowerLevel: Level | null;
  shadow: boolean;
}

export type Change = "nuevo" | "escalado" | "reducido" | "resuelto" | "vencido" | "degradado" | "sin_cambio";

export interface Decision {
  notice: Notice;
  change: Change;
  notify: boolean;
  reason: string;
}

export interface EngineOptions {
  now: Date;
  ownEstimatesMode: "shadow" | "live";
  /** Nivel mínimo para notificar estimaciones propias (preferencia del usuario). */
  minLevel: Level;
  /** Fuentes caídas: sus claves no se resuelven por ausencia. */
  degradedKinds?: InfoKind[];
}

const minutes = (a: Date, b: string) => (a.getTime() - new Date(b).getTime()) / 60_000;
const notifiable = (l: Level, kind: InfoKind, min: Level) => (kind === "oficial" ? l !== "sin_datos" : LEVEL_ORDER[l] >= Math.max(LEVEL_ORDER[min], LEVEL_ORDER.atento));

export function decide(previous: Notice[], candidates: Candidate[], opts: EngineOptions): Decision[] {
  const now = opts.now.toISOString();
  const byKey = new Map(previous.map((n) => [n.key, n]));
  const seen = new Set<string>();
  const out: Decision[] = [];

  // Si llegan dos candidatos con la misma clave, gana el de mayor nivel.
  const dedup = new Map<string, Candidate>();
  for (const c of candidates) {
    const cur = dedup.get(c.key);
    if (!cur || LEVEL_ORDER[c.level] > LEVEL_ORDER[cur.level]) dedup.set(c.key, c);
  }

  for (const c of dedup.values()) {
    seen.add(c.key);
    const shadow = c.kind === "estimacion" && opts.ownEstimatesMode === "shadow";
    const prev = byKey.get(c.key);
    const canNotify = !shadow && notifiable(c.level, c.kind, opts.minLevel);

    if (c.validTo && new Date(c.validTo) <= opts.now) {
      if (prev && prev.state === "activo") out.push(close(prev, "vencido", now, shadow));
      continue;
    }

    if (!prev || prev.state !== "activo") {
      if (c.level === "sin_datos" || (c.kind !== "oficial" && LEVEL_ORDER[c.level] < LEVEL_ORDER.atento)) continue;
      const notice = fresh(c, now, shadow, canNotify);
      out.push({ notice, change: "nuevo", notify: canNotify, reason: canNotify ? "Aviso nuevo" : shadow ? "Estimación en modo sombra" : "Debajo del nivel elegido" });
      continue;
    }

    const up = LEVEL_ORDER[c.level] > LEVEL_ORDER[prev.level];
    const down = LEVEL_ORDER[c.level] < LEVEL_ORDER[prev.level];

    if (up) {
      const notice: Notice = { ...prev, ...c, state: "activo", lastChanged: now, lowerSince: null, lowerLevel: null, shadow, ...(canNotify ? { lastNotified: now, lastNotifiedLevel: c.level } : {}) };
      out.push({ notice, change: "escalado", notify: canNotify, reason: "Subió el nivel" });
      continue;
    }

    if (down) {
      const lowerSince = prev.lowerSince ?? now;
      if (minutes(opts.now, lowerSince) >= HYSTERESIS_MIN) {
        if (c.kind !== "oficial" && LEVEL_ORDER[c.level] < LEVEL_ORDER.atento) {
          out.push(close(prev, "resuelto", now, shadow));
        } else {
          const notice: Notice = { ...prev, ...c, state: "activo", lastChanged: now, lowerSince: null, lowerLevel: null, shadow };
          out.push({ notice, change: "reducido", notify: false, reason: "Bajó el nivel de forma sostenida" });
        }
      } else {
        out.push({ notice: { ...prev, lowerSince, lowerLevel: c.level, validTo: c.validTo }, change: "sin_cambio", notify: false, reason: "Bajada en observación (histéresis)" });
      }
      continue;
    }

    // Mismo nivel: refresca vigencia y texto; renotifica solo después del enfriamiento.
    const cooled = !prev.lastNotified || minutes(opts.now, prev.lastNotified) >= COOLDOWN_MIN;
    const notify = canNotify && cooled && prev.lastNotifiedLevel !== c.level;
    out.push({
      notice: { ...prev, ...c, state: "activo", lowerSince: null, lowerLevel: null, shadow, ...(notify ? { lastNotified: now, lastNotifiedLevel: c.level } : {}) },
      change: "sin_cambio",
      notify,
      reason: notify ? "Recordatorio tras enfriamiento" : "Sin cambios",
    });
  }

  // Avisos activos que ya no tienen candidato.
  for (const prev of previous) {
    if (seen.has(prev.key) || prev.state !== "activo") continue;
    if (prev.validTo && new Date(prev.validTo) <= opts.now) {
      out.push(close(prev, "vencido", now, prev.shadow));
    } else if (opts.degradedKinds?.includes(prev.kind)) {
      out.push({ notice: { ...prev, state: "degradado", lastChanged: now }, change: "degradado", notify: false, reason: "La fuente no respondió: no se puede confirmar si sigue vigente" });
    } else if (prev.kind === "oficial") {
      // El SMN lo retiró del feed antes de su vencimiento (cancelación o reemplazo).
      out.push(close(prev, "resuelto", now, prev.shadow));
    } else {
      const lowerSince = prev.lowerSince ?? now;
      if (minutes(opts.now, lowerSince) >= HYSTERESIS_MIN) out.push(close(prev, "resuelto", now, prev.shadow));
      else out.push({ notice: { ...prev, lowerSince, lowerLevel: "bajo" }, change: "sin_cambio", notify: false, reason: "Sin señal, en observación" });
    }
  }
  return out;
}

function fresh(c: Candidate, now: string, shadow: boolean, notified: boolean): Notice {
  return {
    ...c,
    state: "activo",
    firstSeen: now,
    lastChanged: now,
    lastNotified: notified ? now : null,
    lastNotifiedLevel: notified ? c.level : null,
    lowerSince: null,
    lowerLevel: null,
    shadow,
  };
}

function close(prev: Notice, state: "resuelto" | "vencido", now: string, shadow: boolean): Decision {
  // Se avisa el cierre solo si antes se había notificado la apertura.
  const notify = !shadow && prev.lastNotified != null;
  return { notice: { ...prev, state, lastChanged: now, lowerSince: null, lowerLevel: null }, change: state, notify, reason: state === "vencido" ? "Terminó la vigencia" : "La condición ya no se observa" };
}
