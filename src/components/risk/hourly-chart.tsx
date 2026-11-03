"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HourlyPoint } from "@/lib/domain";
import { fmtHour } from "@/lib/format";

export function HourlyChart({ data }: { data: HourlyPoint[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted-foreground">Sin pronóstico horario disponible.</p>;
  const rows = data.map((d) => ({
    hora: fmtHour(d.time),
    lluvia: d.precipitation ?? 0,
    prob: d.ensembleP10mm1h == null ? null : Math.round(d.ensembleP10mm1h * 100),
  }));
  return (
    <div className="h-56 w-full" role="img" aria-label="Lluvia horaria prevista y porcentaje de miembros del ensamble con 10 mm o más por hora">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="hora" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={2} />
          <YAxis yAxisId="mm" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit=" mm" width={56} />
          <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit="%" width={40} />
          <Tooltip
            contentStyle={{ background: "var(--glass-strong)", border: "1px solid var(--glass-border)", borderRadius: 14, backdropFilter: "blur(16px)", fontSize: 12 }}
            formatter={(v, name) => (name === "lluvia" ? [`${v} mm`, "Lluvia (determinista)"] : [`${v} %`, "Ensamble ≥ 10 mm/h"])}
          />
          <Bar yAxisId="mm" dataKey="lluvia" fill="var(--brand)" radius={[6, 6, 0, 0]} maxBarSize={18} />
          <Line yAxisId="p" dataKey="prob" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
