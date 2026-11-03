import { problem, sameOrigin } from "@/server/core/respond";
import { userClient } from "@/server/db/supabase";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "Origen no permitido");
  const sb = await userClient();
  await sb?.auth.signOut();
  return new Response(null, { status: 204 });
}
