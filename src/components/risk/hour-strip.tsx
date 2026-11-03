import { CloudHail, CloudLightning, CloudRain, CloudRainWind, Minus } from "lucide-react";
import { HOUR_CONDITION_LABEL, type HourCondition, type HourlyPoint } from "@/lib/domain";
import { fmtHour } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICON: Record<HourCondition, typeof CloudRain> = { seco: Minus, lluvia: CloudRain, lluvia_fuerte: CloudRainWind, tormenta: CloudLightning, granizo: CloudHail };
const TONE: Record<HourCondition, string> = {
  seco: "text-muted-foreground/40",
  lluvia: "text-primary",
  lluvia_fuerte: "text-primary",
  tormenta: "text-lvl-high",
  granizo: "text-lvl-severe",
};

const h = (iso: string) => fmtHour(iso).replace(" h", "");

/** Tramos consecutivos con la misma condición: "17–19 h · Tormenta". */
export function segments(data: HourlyPoint[]) {
  const out: { from: string; to: string; condition: HourCondition }[] = [];
  for (const p of data) {
    const last = out.at(-1);
    if (last && last.condition === p.condition) last.to = p.time;
    else out.push({ from: p.time, to: p.time, condition: p.condition });
  }
  return out.filter((s) => s.condition !== "seco");
}

export function HourTimeline({ data }: { data: HourlyPoint[] }) {
  const segs = segments(data);
  if (!data.length) return null;
  if (!segs.length) return <p className="text-sm text-muted-foreground">Sin lluvia prevista en las próximas 24 h.</p>;
  return (
    <ul className="grid gap-1.5 text-sm">
      {segs.slice(0, 5).map((s) => {
        const Icon = ICON[s.condition];
        return (
          <li key={s.from} className="flex items-center gap-3">
            <span className="w-16 text-muted-foreground tabular-nums">{s.from === s.to ? `${h(s.from)} h` : `${h(s.from)}–${h(s.to)} h`}</span>
            <Icon className={cn("size-4", TONE[s.condition])} aria-hidden />
            <span className={cn(s.condition === "granizo" && "font-medium")}>{HOUR_CONDITION_LABEL[s.condition]}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Hora por hora: condición, lluvia en mm y horas dentro de un aviso oficial. */
export function HourStrip({ data }: { data: HourlyPoint[] }) {
  if (!data.length) return <p className="py-6 text-sm text-muted-foreground">Pronóstico horario no disponible.</p>;
  const max = Math.max(4, ...data.map((d) => d.precipitation ?? 0));
  return (
    <div className="scroll-thin -mx-1 overflow-x-auto px-1">
      <ol className="flex min-w-max">
        {data.map((p) => {
          const mm = p.precipitation ?? 0;
          const Icon = ICON[p.condition];
          return (
            <li
              key={p.time}
              title={`${fmtHour(p.time)}: ${HOUR_CONDITION_LABEL[p.condition]}${mm >= 0.1 ? `, ${mm.toFixed(1)} mm` : ""}${p.inAlert ? " · dentro del aviso del SMN" : ""}`}
              className={cn("flex w-10 flex-col items-center gap-1.5 py-2 text-[11px]", p.inAlert && "bg-lvl-high/8 first:rounded-l-xl last:rounded-r-xl")}
            >
              <Icon className={cn("size-4", TONE[p.condition])} aria-label={HOUR_CONDITION_LABEL[p.condition]} />
              <span className="flex h-12 w-2 items-end rounded-full bg-muted">
                <span className={cn("w-full rounded-full", p.condition === "seco" ? "bg-muted-foreground/30" : p.condition === "lluvia" ? "bg-primary" : "bg-lvl-high")} style={{ height: `${mm > 0 ? Math.max(8, (mm / max) * 100) : 0}%` }} />
              </span>
              <span className={cn("tabular-nums", mm >= 1 ? "" : "text-transparent")}>{mm >= 1 ? Math.round(mm) : "0"}</span>
              <span className="text-muted-foreground tabular-nums">{h(p.time)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
