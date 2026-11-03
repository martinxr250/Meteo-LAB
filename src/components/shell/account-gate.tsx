"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "@/components/providers/session";
import { Glass } from "@/components/ui/primitives";

/** Muestra el contenido solo con sesión. Sin sesión: una línea de qué se obtiene y el acceso. */
export function AccountGate({ title, what, children }: { title: string; what: string; children: ReactNode }) {
  const { accounts, user } = useSession();
  if (accounts && user) return <>{children}</>;
  return (
    <div className="mx-auto grid max-w-xl gap-4 pt-10">
      <h1 className="display-title text-4xl">{title}</h1>
      <Glass className="flex items-start gap-3 p-5">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="text-sm">
          <p>{what}</p>
          {accounts ? (
            <Link href="/ingresar" className="mt-3 inline-flex h-9 items-center rounded-full bg-primary px-4 font-medium text-primary-foreground">Ingresar</Link>
          ) : (
            <p className="mt-2 text-muted-foreground">Las cuentas no están configuradas en este entorno.</p>
          )}
        </div>
      </Glass>
    </div>
  );
}
