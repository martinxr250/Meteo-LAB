import { z } from "zod";
import { inCoverage } from "@/lib/geo";
import { problem, readJson } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";

const PlaceInput = z.object({
  kind: z.enum(["casa", "trabajo", "otro"]),
  label: z.string().trim().min(1).max(60),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
}).strict();

export async function GET(request: Request) {
  const g = await requireUser(request);
  if (!g.ok) return g.response;
  const { data, error } = await g.sb.from("places").select("id, kind, label, lat, lon, watch_until, created_at").order("created_at");
  if (error) return problem(500, "No se pudieron leer tus lugares");
  return Response.json(data.map((p) => ({ id: p.id, kind: p.kind, label: p.label, lat: Number(p.lat), lon: Number(p.lon), watchUntil: p.watch_until, createdAt: p.created_at })));
}

export async function POST(request: Request) {
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  const body = await readJson(request, PlaceInput);
  if (!body.ok) return body.response;
  const { lat, lon, kind, label } = body.data;
  if (!inCoverage(lat, lon)) return problem(422, "Por ahora cubrimos Córdoba Capital y alrededores.");
  // Minimización: se guarda con 3 decimales (~110 m). La columna también lo fuerza.
  const { data, error } = await g.sb.from("places").insert({ kind, label, lat: lat.toFixed(3), lon: lon.toFixed(3) }).select("id").single();
  if (error) return problem(400, error.message.includes("máximo") ? error.message : "No se pudo guardar el lugar");
  return Response.json({ id: data.id }, { status: 201 });
}
