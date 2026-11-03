import { NextResponse } from "next/server";
import { userClient } from "@/server/db/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const sb = await userClient();
  if (sb && code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/resumen", url.origin));
  }
  return NextResponse.redirect(new URL("/ingresar?error=enlace", url.origin));
}
