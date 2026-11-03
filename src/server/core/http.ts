import "server-only";
import { createHash } from "node:crypto";
import { env } from "./env";

/**
 * Único punto de salida HTTP del servidor hacia fuentes externas.
 * Protección SSRF: solo hosts declarados en el registro de fuentes, solo HTTPS,
 * sin seguir redirecciones a hosts fuera de la lista, con tiempo y tamaño máximos.
 */
export const ALLOWED_HOSTS = new Set([
  "ssl.smn.gob.ar",
  "api.open-meteo.com",
  "ensemble-api.open-meteo.com",
  "previous-runs-api.open-meteo.com",
  "archive-api.open-meteo.com",
  "alerta.ina.gob.ar",
  "gibs.earthdata.nasa.gov",
  "noaa-goes19.s3.amazonaws.com",
]);

export class SourceError extends Error {
  constructor(message: string, readonly sourceUrl: string, readonly status?: number) {
    super(message);
  }
}

export interface RawResponse {
  url: string;
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  sha256: string;
  fetchedAt: string;
  latencyMs: number;
}

export async function fetchSource(
  url: string,
  { timeoutMs = 12_000, maxBytes = 5_000_000, revalidate = 300 }: { timeoutMs?: number; maxBytes?: number; revalidate?: number | false } = {},
): Promise<RawResponse> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new SourceError(`Host no permitido: ${parsed.hostname}`, url);
  }
  const started = Date.now();
  const res = await fetch(parsed, {
    headers: { "User-Agent": env.SOURCES_USER_AGENT, Accept: "*/*" },
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    ...(revalidate === false ? { cache: "no-store" as const } : { next: { revalidate } }),
  });
  if (res.status >= 300 && res.status < 400) {
    throw new SourceError(`Redirección no permitida (${res.status})`, url, res.status);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new SourceError(`Respuesta demasiado grande (${buf.byteLength} B)`, url, res.status);
  if (!res.ok) throw new SourceError(`HTTP ${res.status}`, url, res.status);
  return {
    url,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    body: buf.toString("utf8"),
    bytes: buf.byteLength,
    sha256: createHash("sha256").update(buf).digest("hex"),
    fetchedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
  };
}
