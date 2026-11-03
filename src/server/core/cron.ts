import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Vercel Cron envía "Authorization: Bearer <CRON_SECRET>". Sin secreto configurado, se rechaza todo. */
export function isCronAuthorized(request: Request) {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
