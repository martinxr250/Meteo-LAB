import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { clientKey, rateLimit } from "./rate-limit";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function problem(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function limited(request: Request, scope: string, limit = 60, windowMs = 60_000) {
  const r = rateLimit(`${scope}:${clientKey(request)}`, limit, windowMs);
  if (r.ok) return null;
  return NextResponse.json({ error: "Demasiadas solicitudes. Probá de nuevo en un momento." }, { status: 429, headers: { "Retry-After": String(r.retryAfterS) } });
}

/** Lee y valida un cuerpo JSON con tamaño máximo. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T, maxBytes = 16_000): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > maxBytes) return { ok: false, response: problem(413, "Cuerpo demasiado grande") };
  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, response: problem(413, "Cuerpo demasiado grande") };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: problem(400, "JSON inválido") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, response: problem(422, "Datos inválidos", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }) };
  return { ok: true, data: parsed.data };
}

/** CSRF: las mutaciones solo se aceptan desde el propio origen. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
