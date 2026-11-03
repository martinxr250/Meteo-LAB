"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  // ID único por instancia: con dos logos en la página (riel oculto + encabezado) el degradé no se pierde.
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5aa9f0" />
          <stop offset="1" stopColor="#1f4fc2" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <path d="M20 37a9 9 0 0 1 1.6-17.85A12 12 0 0 1 44.5 23 7 7 0 0 1 44 37Z" fill="#fff" fillOpacity=".95" />
      <path d="M26 42l-3 8M34 42l-3 8M42 42l-3 8" stroke="#bfe3ff" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[1.15rem] font-semibold tracking-tight", className)}>
      Meteo<span className="text-brand">·</span>LAB
    </span>
  );
}
