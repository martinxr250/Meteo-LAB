"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { ApiError } from "@/lib/api";

export function Providers({ nonce, children }: { nonce?: string; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchInterval: 5 * 60_000,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
        mutationCache: new MutationCache({
          onError: (err) => toast.error(err instanceof Error ? err.message : "Ocurrió un error"),
        }),
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce} disableTransitionOnChange>
      <QueryClientProvider client={client}>
        {children}
        <Toaster position="bottom-center" closeButton toastOptions={{ className: "glass-strong !rounded-2xl" }} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
