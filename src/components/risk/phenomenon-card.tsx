"use client";

import { ChevronDown, CloudHail, CloudRainWind, Waves } from "lucide-react";
import { useState } from "react";
import { PHENOMENON_LABEL, type Phenomenon, type PhenomenonAssessment } from "@/lib/domain";
import { ago, fmtDateTime, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Glass } from "@/components/ui/primitives";
import { KindBadge, LEVEL_STYLE, LevelBadge } from "./badges";

const ICON: Partial<Record<Phenomenon, typeof Waves>> = { granizo: CloudHail, lluvia_intensa: CloudRainWind, anegamiento: Waves };
const QUESTION: Partial<Record<Phenomenon, string>> = {
  granizo: "¿Hay condiciones de granizo?",
  lluvia_intensa: "¿Se esperan lluvias intensas?",
  anegamiento: "¿Hay condiciones para anegamientos?",
};
const STEPS = ["bajo", "atento", "alto", "muy_alto"] as const;

export function PhenomenonCard({ a, shadow, officialMention }: { a: PhenomenonAssessment; shadow: boolean; officialMention?: string }) {
  const [open, setOpen] = useState(false);
  const Icon = ICON[a.phenomenon] ?? CloudRainWind;
  const s = LEVEL_STYLE[a.level];
  return (
    <Glass className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-11 place-items-center rounded-2xl", s.bg)}>
            <Icon className={cn("size-5", s.text)} aria-hidden />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">{QUESTION[a.phenomenon] ?? PHENOMENON_LABEL[a.phenomenon]}</p>
            <h3 className="font-semibold">{PHENOMENON_LABEL[a.phenomenon]}</h3>
          </div>
        </div>
        <LevelBadge level={a.level} />
      </div>

      {/* Escala de 4 pasos; "sin datos" se muestra rayado, nunca como nivel bajo. */}
      <div className="mt-4 grid grid-cols-4 gap-1" role="img" aria-label={`Nivel: ${a.level.replace("_", " ")}`}>
        {STEPS.map((step, i) => (
          <span key={step} className={cn("h-1.5 rounded-full", a.level === "sin_datos" ? "bg-lvl-none/30 hatched" : i <= STEPS.indexOf(a.level as (typeof STEPS)[number]) ? s.bar : "bg-muted")} />
        ))}
      </div>

      {officialMention && (
        <p className="mt-4 rounded-xl bg-primary/10 px-3 py-2 text-xs leading-relaxed text-primary">
          <strong>Prevalece el aviso oficial:</strong> {officialMention}. Los modelos globales suelen subestimar tormentas locales.
        </p>
      )}
      <p className="mt-4 text-sm leading-relaxed">{a.summary}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <KindBadge kind={a.kind} extra={shadow && a.kind === "estimacion" ? "modo sombra" : undefined} />
        {a.probability != null && <span className="display-figure text-2xl">{pct(a.probability)}</span>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{a.metric}</p>
      {a.window && <p className="text-xs text-muted-foreground">Ventana: {fmtDateTime(a.window.from)} → {fmtDateTime(a.window.to)}</p>}

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-4 flex items-center gap-1 self-start text-xs font-medium text-primary">
        ¿Cómo lo calculamos? <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 grid gap-2 rounded-xl bg-[var(--glass-strong)] p-3 text-xs leading-relaxed">
          <p><strong>Método.</strong> {a.method}</p>
          <p><strong>Incertidumbre.</strong> {a.uncertainty}</p>
          {a.abstained && <p><strong>Abstención.</strong> {a.abstained}</p>}
          <div>
            <strong>Datos usados.</strong>
            <ul className="mt-1 list-disc pl-4">
              {a.inputs.map((i, k) => (
                <li key={k}>{i.source}{i.detail ? ` — ${i.detail}` : ""}{i.issuedAt ? ` (${ago(i.issuedAt)})` : ""}</li>
              ))}
            </ul>
          </div>
          <p className="text-muted-foreground">Versión: {a.modelVersion}</p>
        </div>
      )}
    </Glass>
  );
}
