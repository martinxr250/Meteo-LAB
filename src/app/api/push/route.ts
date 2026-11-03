import { z } from "zod";
import { problem, readJson } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";
import { isAllowedPushEndpoint } from "@/server/modules/notify/push";

const Sub = z.object({
  endpoint: z.url().max(1000).refine(isAllowedPushEndpoint, "Servicio de push no admitido"),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function POST(request: Request) {
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  const body = await readJson(request, Sub);
  if (!body.ok) return body.response;
  const { error } = await g.sb.from("push_subscriptions").upsert({ endpoint: body.data.endpoint, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth, user_id: g.user.id }, { onConflict: "endpoint" });
  if (error) return problem(500, "No se pudo registrar el dispositivo");
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  await g.sb.from("push_subscriptions").delete().eq("user_id", g.user.id);
  return new Response(null, { status: 204 });
}
