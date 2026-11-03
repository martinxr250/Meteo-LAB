import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// CSP estricta con nonce por request. Los scripts solo corren si traen el nonce (strict-dynamic).
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tiles.openfreemap.org https://gibs.earthdata.nasa.gov",
    "font-src 'self'",
    // Patrón BFF: el navegador nunca habla con Supabase directamente; las cookies de sesión son httpOnly.
    `connect-src 'self' https://tiles.openfreemap.org https://gibs.earthdata.nasa.gov${isDev ? " ws:" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers } });

  // Refresca la sesión de Supabase si está configurado (cookies httpOnly).
  if (supabase && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const sb = createServerClient(supabase, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers } });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, httpOnly: true, secure: !isDev, sameSite: "lax" }));
        },
      },
    });
    await sb.auth.getUser();
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
