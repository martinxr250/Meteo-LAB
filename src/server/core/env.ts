import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_MODE: z.enum(["production", "demo"]).default("production"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional().or(z.literal("")),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:operaciones@example.org"),
  OWN_ESTIMATES_MODE: z.enum(["shadow", "live"]).default("shadow"),
  SOURCES_USER_AGENT: z.string().default("MeteoLAB/0.1 (+https://github.com/martinxr250/Meteo-LAB)"),
});

export const env = schema.parse(process.env);

export const hasSupabase = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const hasServiceRole = hasSupabase && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
export const hasPush = Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
