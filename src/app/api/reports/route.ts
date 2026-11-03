import { z } from "zod";
import { inCoverage } from "@/lib/geo";
import { limited, problem, readJson } from "@/server/core/respond";
import { requireUser } from "@/server/modules/auth/guard";

const Report = z.object({
  phenomenon: z.enum(["granizo", "lluvia_intensa", "anegamiento", "otro"]),
  hail_size: z.enum(["menor_1cm", "1_2cm", "2_4cm", "mayor_4cm"]).nullable().optional(),
  lat: z.number(),
  lon: z.number(),
  observed_at: z.iso.datetime(),
  // Texto plano; React lo escapa al mostrarlo. Se quitan caracteres de control.
  description: z.string().max(500).transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).optional(),
}).strict();

export async function GET(request: Request) {
  const g = await requireUser(request);
  if (!g.ok) return g.response;
  const { data, error } = await g.sb
    .from("community_reports")
    .select("id, phenomenon, hail_size, lat, lon, observed_at, description, status, created_at, user_id")
    .gte("observed_at", new Date(Date.now() - 48 * 3_600_000).toISOString())
    .order("observed_at", { ascending: false })
    .limit(200);
  if (error) return problem(500, "No se pudieron leer los reportes");
  return Response.json(data.map(({ user_id, ...r }) => ({ ...r, mine: user_id === g.user.id })));
}

export async function POST(request: Request) {
  const tooMany = limited(request, "reports", 5, 3_600_000);
  if (tooMany) return tooMany;
  const g = await requireUser(request, { mutation: true });
  if (!g.ok) return g.response;
  const body = await readJson(request, Report, 4_000);
  if (!body.ok) return body.response;
  const r = body.data;
  if (!inCoverage(r.lat, r.lon)) return problem(422, "Fuera del área de cobertura");
  const { error } = await g.sb.from("community_reports").insert({ ...r, hail_size: r.phenomenon === "granizo" ? r.hail_size ?? null : null, lat: r.lat.toFixed(2), lon: r.lon.toFixed(2) });
  if (error) return problem(400, error.message.includes("Demasiados") ? error.message : "No se pudo enviar el reporte");
  return Response.json({ status: "pendiente" }, { status: 201 });
}
