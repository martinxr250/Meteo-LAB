import "server-only";

/*
 * Logs estructurados sin secretos ni coordenadas precisas.
 * Las claves sensibles se eliminan y las coordenadas se reducen a 1 decimal (~11 km).
 */
const SECRET_KEYS = /(token|secret|password|authorization|cookie|key|p256dh|auth|endpoint)/i;
const COORD_KEYS = /^(lat|lon|lng|latitude|longitude)$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[profundo]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k)) out[k] = "[redactado]";
      else if (COORD_KEYS.test(k) && typeof v === "number") out[k] = Math.round(v * 10) / 10;
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/Bearer\s+[\w.-]+/g, "Bearer [redactado]");
  return value;
}

type Level = "info" | "warn" | "error";
export function log(level: Level, event: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(redact(data) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
