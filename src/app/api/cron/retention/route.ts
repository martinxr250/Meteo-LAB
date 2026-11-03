import { isCronAuthorized } from "@/server/core/cron";
import { log } from "@/server/core/log";
import { problem } from "@/server/core/respond";
import { serviceClient } from "@/server/db/supabase";

/** Aplica los plazos de retención (docs/seguridad/privacidad.md). */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return problem(401, "No autorizado");
  const sb = serviceClient();
  if (!sb) return problem(501, "Supabase no configurado");
  const { data, error } = await sb.rpc("apply_retention");
  if (error) return problem(500, "Falló la retención");
  log("info", "retention.done", { deleted: data });
  return Response.json({ deleted: data });
}
