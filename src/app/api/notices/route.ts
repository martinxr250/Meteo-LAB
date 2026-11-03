import { problem } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";

export async function GET(request: Request) {
  const g = await requireUser(request);
  if (!g.ok) return g.response;
  const { data, error } = await g.sb
    .from("notices")
    .select("id, place_id, phenomenon, kind, level, state, title, body, source, valid_to, first_seen, last_changed, shadow, notice_events(change, level, reason, at)")
    .order("last_changed", { ascending: false })
    .limit(100);
  if (error) return problem(500, "No se pudieron leer tus avisos");
  return Response.json(data);
}
