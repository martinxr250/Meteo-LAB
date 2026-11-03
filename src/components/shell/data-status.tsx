"use client";

import Link from "next/link";
import { useStatus } from "@/hooks/use-risk";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Estado visible de actualización: verde si todo está al día, ámbar si hay degradación. */
export function DataStatus() {
  const { data, isLoading, isError } = useStatus();
  const degraded = isError || (data?.degraded.length ?? 0) > 0;
  const label = isLoading ? "Verificando fuentes…" : isError ? "Sin conexión con las fuentes" : degraded ? "Datos parciales" : "Datos al día";
  return (
    <Link href="/fuentes" className="glass flex h-10 items-center gap-2 rounded-full px-3.5 text-xs font-medium" title={data ? `Actualizado ${ago(data.generatedAt)}` : undefined}>
      <span className={cn("live-dot size-2 rounded-full", isLoading ? "bg-lvl-none text-lvl-none" : degraded ? "bg-lvl-watch text-lvl-watch" : "bg-success text-success")} aria-hidden />
      <span>{label}</span>
      {data && <span className="hidden text-muted-foreground sm:inline">· {ago(data.generatedAt)}</span>}
    </Link>
  );
}
