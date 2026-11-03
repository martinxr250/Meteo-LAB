import { z } from "zod";
import { limited, problem, readJson, sameOrigin } from "@/server/core/respond";
import { userClient } from "@/server/db/supabase";

const Body = z.object({ email: z.email().max(200) }).strict();

/** Acceso sin contraseña: enlace de un solo uso por correo (Supabase Auth). */
export async function POST(request: Request) {
  const tooMany = limited(request, "login", 5, 15 * 60_000);
  if (tooMany) return tooMany;
  if (!sameOrigin(request)) return problem(403, "Origen no permitido");
  const sb = await userClient();
  if (!sb) return problem(501, "Las cuentas no están configuradas en este entorno (modo local).");
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const origin = new URL(request.url).origin;
  await sb.auth.signInWithOtp({ email: body.data.email, options: { emailRedirectTo: `${origin}/api/auth/callback` } });
  // Misma respuesta exista o no la cuenta (evita enumeración).
  return Response.json({ message: "Si el correo es válido, te enviamos un enlace para entrar." });
}
