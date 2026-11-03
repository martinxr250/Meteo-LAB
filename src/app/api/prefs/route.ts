import { z } from "zod";
import { problem, readJson } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";

const Prefs = z.object({
  push_enabled: z.boolean(),
  min_level: z.enum(["atento", "alto", "muy_alto"]),
  phenomena: z.array(z.enum(["granizo", "lluvia_intensa", "anegamiento", "tormenta"])).max(4),
  quiet_start: z.number().int().min(0).max(23).nullable(),
  quiet_end: z.number().int().min(0).max(23).nullable(),
}).strict();

export async function GET(request: Request) {
  const g = await requireUser(request);
  if (!g.ok) return g.response;
  const { data } = await g.sb.from("notification_prefs").select("push_enabled, min_level, phenomena, quiet_start, quiet_end, official_always").maybeSingle();
  return Response.json(data ?? { push_enabled: false, min_level: "atento", phenomena: ["granizo", "lluvia_intensa", "anegamiento", "tormenta"], quiet_start: null, quiet_end: null, official_always: true });
}

export async function PUT(request: Request) {
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  const body = await readJson(request, Prefs);
  if (!body.ok) return body.response;
  // Los avisos oficiales siempre se entregan: no es configurable desde el cliente.
  const { error } = await g.sb.from("notification_prefs").upsert({ user_id: g.user.id, ...body.data, official_always: true, updated_at: new Date().toISOString() });
  if (error) return problem(500, "No se pudieron guardar las preferencias");
  return new Response(null, { status: 204 });
}
