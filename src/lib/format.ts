const TZ = "America/Argentina/Cordoba";

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function fmtHour(iso: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)) + " h";
}

/** "hace 12 min", "hace 3 h". Para mostrar antigüedad de cada dato. */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "sin dato";
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export function until(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "sin vencimiento informado";
  const m = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (m <= 0) return "vencido";
  if (m < 60) return `vence en ${m} min`;
  return `vence en ${Math.round(m / 60)} h`;
}

export function pct(p: number | null | undefined) {
  return p == null ? "s/d" : `${Math.round(p * 100)} %`;
}

/** "hoy", "mañana" o el día de la semana, en hora de Córdoba. */
function dayWord(d: Date, now = new Date()) {
  const key = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(x);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (key(d) === key(now)) return "Hoy";
  if (key(d) === key(tomorrow)) return "Mañana";
  const w = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long" }).format(d);
  return w[0].toUpperCase() + w.slice(1);
}

/** "Mañana de 15:00 a 21:00" · "Hoy desde las 18:00". */
export function whenRange(from: string | null, rawTo: string | null) {
  if (!from) return null;
  // Las vigencias del SMN terminan en hh:59:59: se muestran como la hora redonda siguiente.
  const to = rawTo && new Date(rawTo).getSeconds() === 59 ? new Date(new Date(rawTo).getTime() + 1000).toISOString() : rawTo;
  const f = new Date(from);
  const start = f.getTime() < Date.now() ? "Ahora" : `${dayWord(f)} de ${fmtTime(from)}`;
  if (!to) return start === "Ahora" ? "Ahora" : `${dayWord(f)} desde las ${fmtTime(from)}`;
  const t = new Date(to);
  const sameDay = dayWord(f) === dayWord(t);
  if (start === "Ahora") return `Ahora, hasta ${sameDay ? "las " : `${dayWord(t).toLowerCase()} a las `}${fmtTime(to)}`;
  return `${start} a ${sameDay ? "" : `${dayWord(t).toLowerCase()} `}${fmtTime(to)}`;
}
