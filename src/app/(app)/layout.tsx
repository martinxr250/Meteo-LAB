import type { ReactNode } from "react";
import { SessionProvider, type SessionInfo } from "@/components/providers/session";
import { AppShell } from "@/components/shell/app-shell";
import { RegisterSW } from "@/components/shell/register-sw";
import { env, hasSupabase } from "@/server/core/env";
import { currentUser } from "@/server/db/supabase";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, aal } = hasSupabase ? await currentUser() : { user: null, aal: null };
  const session: SessionInfo = {
    accounts: hasSupabase,
    user: user ? { email: user.email ?? "" } : null,
    mfa: aal === "aal2",
    appMode: env.NEXT_PUBLIC_APP_MODE,
    ownEstimatesMode: env.OWN_ESTIMATES_MODE,
    vapidPublicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  };
  return (
    <SessionProvider value={session}>
      <RegisterSW />
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
