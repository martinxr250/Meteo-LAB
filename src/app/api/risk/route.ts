import { z } from "zod";
import { inCoverage } from "@/lib/geo";
import { limited, problem } from "@/server/core/respond";
import { assessPoint } from "@/server/modules/risk/assess";

export const maxDuration = 30;

const q = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });

export async function GET(request: Request) {
  const tooMany = limited(request, "risk", 30);
  if (tooMany) return tooMany;
  const url = new URL(request.url);
  const parsed = q.safeParse({ lat: url.searchParams.get("lat"), lon: url.searchParams.get("lon") });
  if (!parsed.success) return problem(422, "Coordenadas inválidas");
  const { lat, lon } = parsed.data;
  if (!inCoverage(lat, lon)) return problem(422, "Por ahora cubrimos Córdoba Capital y alrededores.");
  const risk = await assessPoint(lat, lon);
  // La traza interna (hashes de insumos) queda en el servidor.
  const pub: Partial<typeof risk> = { ...risk };
  delete pub.trace;
  delete pub.matched;
  return Response.json(pub, { headers: { "Cache-Control": "private, max-age=120" } });
}
