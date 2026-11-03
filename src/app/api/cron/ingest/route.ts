import { isCronAuthorized } from "@/server/core/cron";
import { problem } from "@/server/core/respond";
import { serviceClient } from "@/server/db/supabase";
import { runIngest } from "@/server/modules/ops/pipeline";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return problem(401, "No autorizado");
  const sb = serviceClient();
  if (!sb) return problem(501, "Supabase no configurado: la ingesta persistente está desactivada");
  const report = await runIngest(sb);
  return Response.json(report, { status: report.errors.length ? 207 : 200 });
}
