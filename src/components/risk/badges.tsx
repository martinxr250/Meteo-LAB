import { BadgeCheck, Bot, Eye, MessageSquareWarning } from "lucide-react";
import { INFO_KIND_LABEL, LEVEL_LABEL, type InfoKind, type Level, type OfficialColor } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/primitives";

export const LEVEL_STYLE: Record<Level, { dot: string; bg: string; text: string; bar: string }> = {
  sin_datos: { dot: "bg-lvl-none", bg: "bg-lvl-none/12 hatched", text: "text-muted-foreground", bar: "bg-lvl-none/40 hatched" },
  bajo: { dot: "bg-lvl-low", bg: "bg-lvl-low/14", text: "text-[color-mix(in_oklch,var(--lvl-low),var(--foreground)_35%)]", bar: "bg-lvl-low" },
  atento: { dot: "bg-lvl-watch", bg: "bg-lvl-watch/18", text: "text-[color-mix(in_oklch,var(--lvl-watch),var(--foreground)_55%)]", bar: "bg-lvl-watch" },
  alto: { dot: "bg-lvl-high", bg: "bg-lvl-high/18", text: "text-[color-mix(in_oklch,var(--lvl-high),var(--foreground)_40%)]", bar: "bg-lvl-high" },
  muy_alto: { dot: "bg-lvl-severe", bg: "bg-lvl-severe/16", text: "text-[color-mix(in_oklch,var(--lvl-severe),var(--foreground)_25%)]", bar: "bg-lvl-severe" },
};

export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  const s = LEVEL_STYLE[level];
  return (
    <Pill className={cn(s.bg, s.text, className)}>
      <span className={cn("size-2 rounded-full", s.dot)} aria-hidden />
      {LEVEL_LABEL[level]}
    </Pill>
  );
}

const KIND_ICON: Record<InfoKind, typeof Bot> = { oficial: BadgeCheck, estimacion: Bot, observacion: Eye, reporte_comunitario: MessageSquareWarning };
const KIND_STYLE: Record<InfoKind, string> = {
  oficial: "bg-primary/12 text-primary",
  estimacion: "bg-brand-soft text-[color-mix(in_oklch,var(--brand),var(--foreground)_45%)]",
  observacion: "bg-success/14 text-[color-mix(in_oklch,var(--success),var(--foreground)_35%)]",
  reporte_comunitario: "bg-muted text-muted-foreground",
};

export function KindBadge({ kind, extra }: { kind: InfoKind; extra?: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <Pill className={KIND_STYLE[kind]}>
      <Icon className="size-3.5" aria-hidden />
      {INFO_KIND_LABEL[kind]}
      {extra && <span className="opacity-70">· {extra}</span>}
    </Pill>
  );
}

const SMN_STYLE: Record<OfficialColor, string> = {
  amarilla: "bg-smn-amarilla text-[oklch(0.3_0.06_90)]",
  naranja: "bg-smn-naranja text-[oklch(0.25_0.06_50)]",
  roja: "bg-smn-roja text-white",
};

export function OfficialColorBadge({ color }: { color: OfficialColor | null }) {
  if (!color) return <Pill className="bg-muted text-muted-foreground">Sin color informado</Pill>;
  return <Pill className={cn("font-semibold", SMN_STYLE[color])}>Alerta {color}</Pill>;
}
