import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { hasSupabase } from "@/server/core/env";
import { problem, sameOrigin } from "@/server/core/respond";
import { currentUser } from "@/server/db/supabase";

type Ok = { ok: true; sb: SupabaseClient; user: User; aal: string | null };
type Fail = { ok: false; response: Response };

/** Exige sesión. En mutaciones, además, mismo origen (CSRF). Con `admin`, exige MFA (aal2); el rol lo verifica RLS. */
export async function requireUser(request: Request, { mutation = false, mfa = false } = {}): Promise<Ok | Fail> {
  if (!hasSupabase) return { ok: false, response: problem(501, "Las cuentas no están configuradas en este entorno (modo local).") };
  if (mutation && !sameOrigin(request)) return { ok: false, response: problem(403, "Origen no permitido") };
  const { sb, user, aal } = await currentUser();
  if (!sb || !user) return { ok: false, response: problem(401, "Iniciá sesión para continuar") };
  if (mfa && aal !== "aal2") return { ok: false, response: problem(403, "Esta sección requiere verificación en dos pasos") };
  return { ok: true, sb, user, aal };
}
