import "server-only";
import webpush from "web-push";
import { env, hasPush } from "@/server/core/env";
import { log } from "@/server/core/log";

const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /push\.services\.mozilla\.com$/];

/** Solo servicios de push conocidos: el servidor nunca hace pedidos a URLs arbitrarias (SSRF). */
export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  kind: string;
}

let configured = false;
function setup() {
  if (!configured && hasPush) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return configured;
}

export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<{ ok: boolean; gone: boolean; error?: string }> {
  if (!setup()) return { ok: false, gone: false, error: "Push no configurado" };
  if (!isAllowedPushEndpoint(sub.endpoint)) return { ok: false, gone: true, error: "Endpoint no permitido" };
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high", timeout: 8000 });
    return { ok: true, gone: false };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    log("warn", "push.failed", { status });
    return { ok: false, gone: status === 404 || status === 410, error: `HTTP ${status ?? "?"}` };
  }
}

/** Horario silencioso: no aplica a avisos oficiales. Horas en hora argentina (UTC−3). */
export function inQuietHours(now: Date, start: number | null, end: number | null) {
  if (start == null || end == null || start === end) return false;
  const h = (now.getUTCHours() + 21) % 24;
  return start < end ? h >= start && h < end : h >= start || h < end;
}
