import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Meteo-LAB", template: "%s · Meteo-LAB" },
  description: "Anticipá granizo, lluvia intensa y anegamientos en tus lugares de Córdoba, con avisos oficiales del SMN atribuidos.",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Meteo-LAB", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eaf3fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1726" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="es-AR" suppressHydrationWarning className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
