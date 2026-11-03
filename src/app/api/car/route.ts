import { z } from "zod";
import { inCoverage } from "@/lib/geo";
import { problem, readJson } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";

/** "Dejé el auto acá": reemplaza el auto anterior y lo vigila por un tiempo limitado (máx. 24 h). */
const CarInput = z.object({ lat: z.number(), lon: z.number(), hours: z.number().int().min(1).max(24).default(8) }).strict();

export async function POST(request: Request) {
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  const body = await readJson(request, CarInput);
  if (!body.ok) return body.response;
  const { lat, lon, hours } = body.data;
  if (!inCoverage(lat, lon)) return problem(422, "Por ahora cubrimos Córdoba Capital y alrededores.");
  await g.sb.from("places").delete().eq("kind", "auto");
  const watchUntil = new Date(Date.now() + hours * 3_600_000).toISOString();
  const { data, error } = await g.sb.from("places").insert({ kind: "auto", label: "Mi auto", lat: lat.toFixed(3), lon: lon.toFixed(3), watch_until: watchUntil }).select("id").single();
  if (error) return problem(400, "No se pudo guardar la ubicación del auto");
  return Response.json({ id: data.id, watchUntil }, { status: 201 });
}

export async function DELETE(request: Request) {
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  await g.sb.from("places").delete().eq("kind", "auto");
  return new Response(null, { status: 204 });
}
