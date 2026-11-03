import { z } from "zod";
import { limited, problem, readJson } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";

/** MFA TOTP (Supabase Auth). Obligatorio para administración y moderación (aal2). */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }),
  z.object({ action: z.literal("verify"), factorId: z.string().max(100), code: z.string().regex(/^\d{6}$/) }),
]);

export async function POST(request: Request) {
  const tooMany = limited(request, "mfa", 10, 15 * 60_000);
  if (tooMany) return tooMany;
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  if (body.data.action === "enroll") {
    const { data, error } = await g.sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Meteo-LAB ${Date.now()}` });
    if (error) return problem(400, "No se pudo iniciar la verificación en dos pasos");
    return Response.json({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  const { error } = await g.sb.auth.mfa.challengeAndVerify({ factorId: body.data.factorId, code: body.data.code });
  if (error) return problem(400, "Código incorrecto");
  return new Response(null, { status: 204 });
}
