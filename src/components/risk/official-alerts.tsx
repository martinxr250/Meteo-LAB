import { ExternalLink, ShieldAlert } from "lucide-react";
import type { OfficialAlert } from "@/lib/domain";
import { fmtDateTime, until } from "@/lib/format";
import { Glass } from "@/components/ui/primitives";
import { KindBadge, OfficialColorBadge } from "./badges";

type Matched = OfficialAlert & { distanceKm?: number; relation?: "dentro" | "cerca"; similarNearby?: number };

export function OfficialAlerts({ alerts, placeLabel }: { alerts: Matched[]; placeLabel: string }) {
  if (!alerts.length) {
    return (
      <Glass className="flex items-center gap-3 p-4 text-sm">
        <ShieldAlert className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <p>
          <strong>Sin avisos oficiales vigentes</strong> que incluyan {placeLabel} o estén a menos de 15 km, según el último feed del SMN.
          <span className="text-muted-foreground"> Esto no significa “sin riesgo”: revisá las estimaciones y el estado de las fuentes.</span>
        </p>
      </Glass>
    );
  }
  return (
    <div className="grid gap-3">
      {alerts.map((a) => (
        <Glass key={a.id} strong className="border-l-4 p-5" style={{ borderLeftColor: a.color ? `var(--smn-${a.color})` : undefined }}>
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind="oficial" extra="SMN" />
            <OfficialColorBadge color={a.color} />
            <span className="text-xs text-muted-foreground">
              {a.product === "aviso_corto_plazo" ? "Aviso a muy corto plazo" : "Alerta por zonas"} ·{" "}
              {a.relation === "cerca" ? `a ${a.distanceKm} km de ${placeLabel}` : `incluye ${placeLabel}`}
              {a.similarNearby ? ` · mismo aviso en ${a.similarNearby} zona${a.similarNearby > 1 ? "s" : ""} vecina${a.similarNearby > 1 ? "s" : ""}` : ""}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold">{a.headline || a.event}</h3>
          {a.description && a.description !== a.headline && <p className="mt-1 text-sm leading-relaxed">{a.description}</p>}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Emitido</dt><dd>{fmtDateTime(a.sent)}</dd></div>
            <div><dt className="text-muted-foreground">Desde</dt><dd>{fmtDateTime(a.onset ?? a.sent)}</dd></div>
            <div><dt className="text-muted-foreground">Hasta</dt><dd>{fmtDateTime(a.expires)} · {until(a.expires)}</dd></div>
            <div><dt className="text-muted-foreground">Certeza CAP</dt><dd>{a.certainty || "—"}</dd></div>
          </dl>
          {a.colorFrom === "severidad_cap" && <p className="mt-2 text-[11px] text-muted-foreground">Color inferido de la severidad CAP ({a.severity}).</p>}
          {a.instruction && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium text-primary">Qué recomienda el SMN</summary>
              <p className="mt-2 leading-relaxed whitespace-pre-line">{a.instruction}</p>
            </details>
          )}
          <a href={a.web} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
            Documento oficial (CAP) <ExternalLink className="size-3" />
          </a>
        </Glass>
      ))}
    </div>
  );
}
