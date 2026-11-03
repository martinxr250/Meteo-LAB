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
