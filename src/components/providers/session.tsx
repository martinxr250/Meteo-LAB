"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface SessionInfo {
  /** Supabase configurado en este entorno. Si no, "modo local". */
  accounts: boolean;
  user: { email: string } | null;
  mfa: boolean;
  appMode: "production" | "demo";
  ownEstimatesMode: "shadow" | "live";
  vapidPublicKey: string | null;
}

const Ctx = createContext<SessionInfo | null>(null);

export function SessionProvider({ value, children }: { value: SessionInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession fuera de SessionProvider");
  return v;
}
