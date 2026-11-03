import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, hasServiceRole, hasSupabase } from "@/server/core/env";

/** Cliente con la sesión del usuario: toda consulta pasa por RLS. */
export async function userClient(): Promise<SupabaseClient | null> {
  if (!hasSupabase) return null;
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, { ...options, httpOnly: true, secure: true, sameSite: "lax" }));
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Cliente de servicio (omite RLS). Solo para tareas programadas del servidor. */
export function serviceClient(): SupabaseClient | null {
  if (!hasServiceRole) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function currentUser() {
  const sb = await userClient();
  if (!sb) return { sb: null, user: null, aal: null as string | null };
  const { data } = await sb.auth.getUser();
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return { sb, user: data.user, aal: aal?.currentLevel ?? null };
}
