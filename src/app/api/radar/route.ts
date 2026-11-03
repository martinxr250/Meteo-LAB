import { fetchSource } from "@/server/core/http";
import { problem } from "@/server/core/respond";

/** Metadatos de cuadros de radar (RainViewer). Capa visual únicamente; no alimenta modelos. */
export async function GET() {
  try {
    const r = await fetchSource("https://api.rainviewer.com/public/weather-maps.json", { revalidate: 300, maxBytes: 200_000 });
    const d = JSON.parse(r.body);
    const frames = ((d?.radar?.past ?? []) as { time: number; path: string }[])
      .map((f) => ({ time: new Date(f.time * 1000).toISOString(), path: String(f.path) }))
      .filter((f) => /^\/v2\/radar\/[a-z0-9]+$/i.test(f.path));
    return Response.json(
      { host: "https://tilecache.rainviewer.com", frames, attribution: "RainViewer (uso no comercial)", fetchedAt: r.fetchedAt },
      { headers: { "Cache-Control": "public, s-maxage=300" } },
    );
  } catch {
    return problem(503, "Radar no disponible");
  }
}
