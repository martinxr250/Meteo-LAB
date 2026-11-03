import { z } from "zod";
import { problem, readJson } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";

const Moderation = z.object({ status: z.enum(["aprobado", "rechazado"]) }).strict();

/** Moderación: requiere MFA; el rol de moderador lo exige la política RLS. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(request, { mutation: true, mfa: true });
  if (!g.ok) return g.response;
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return problem(422, "Identificador inválido");
  const body = await readJson(request, Moderation);
  if (!body.ok) return body.response;
  const { data, error } = await g.sb
    .from("community_reports")
    .update({ status: body.data.status, moderated_by: g.user.id, moderated_at: new Date().toISOString() })
    .eq("id", id.data)
    .select("id");
  if (error) return problem(500, "No se pudo moderar");
  if (!data.length) return problem(403, "Sin permiso o reporte inexistente");
  return new Response(null, { status: 204 });
}
