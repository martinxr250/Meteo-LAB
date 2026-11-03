import { z } from "zod";
import { problem } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";

const Id = z.uuid();

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return problem(422, "Identificador inválido");
  // RLS garantiza que solo se borre si es propio; 0 filas = no existe o no es tuyo (misma respuesta).
  const { data, error } = await g.sb.from("places").delete().eq("id", id.data).select("id");
  if (error) return problem(500, "No se pudo eliminar");
  if (!data.length) return problem(404, "Lugar no encontrado");
  return new Response(null, { status: 204 });
}
