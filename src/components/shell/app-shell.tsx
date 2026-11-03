"use client";

import { Activity, Bell, Database, Gauge, LogIn, LogOut, Map as MapIcon, MapPin, MessageSquareWarning, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "@/components/providers/session";
import { Logo, Wordmark } from "@/components/ui/logo";
import { Button } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DataStatus } from "./data-status";

const NAV = [
  { href: "/resumen", label: "Resumen", icon: Gauge },
  { href: "/mapa", label: "Mapa", icon: MapIcon },
  { href: "/lugares", label: "Lugares", icon: MapPin },
  { href: "/alertas", label: "Alertas", icon: Bell },
  { href: "/reportes", label: "Reportes", icon: MessageSquareWarning },
  { href: "/fuentes", label: "Fuentes", icon: Database },
  { href: "/preferencias", label: "Preferencias", icon: Settings },
];

// Preferencia de riel compacto (solo escritorio), igual que en Tableros.
const MINI_KEY = "meteolab.sidebarMini";
const MINI_EVENT = "meteolab:sidebar";
function subscribeMini(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(MINI_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(MINI_EVENT, cb);
  };
}
function readMini() {
  try {
    return localStorage.getItem(MINI_KEY) === "1";
  } catch {
    return false;
  }
}
function setMini(v: boolean) {
  try {
    localStorage.setItem(MINI_KEY, v ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(MINI_EVENT));
}

export function AppShell({ children }: { children: ReactNode }) {
  const mini = useSyncExternalStore(subscribeMini, readMini, () => false);
  const pathname = usePathname();
  const session = useSession();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setMini(!readMini());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="sky-scene" aria-hidden />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <aside
        className={cn("hidden shrink-0 p-3 pr-0 transition-[width] md:block", mini ? "w-[5.5rem]" : "w-[16.5rem]")}
        aria-label="Navegación principal"
      >
        <div className="glass flex h-full flex-col rounded-3xl">
          <Link href="/resumen" className={cn("flex items-center gap-2.5 px-5 pt-5 pb-5", mini && "justify-center px-0")} aria-label="Meteo-LAB, inicio">
            <Logo />
            {!mini && <Wordmark />}
          </Link>
          <nav className="grid gap-1 px-3">
            {NAV.map((n) => (
              <NavLink key={n.href} {...n} active={pathname.startsWith(n.href)} mini={mini} />
            ))}
            {session.user && session.mfa && <NavLink href="/operaciones" label="Operaciones" icon={Activity} active={pathname.startsWith("/operaciones")} mini={mini} />}
          </nav>
          <div className="mt-auto grid gap-2 p-3">
            <AccountButton mini={mini} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 sm:px-6">
          <Link href="/resumen" className="flex items-center gap-2 md:hidden" aria-label="Meteo-LAB, inicio">
            <Logo className="size-8" />
            <Wordmark className="text-base" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label={mini ? "Expandir menú lateral" : "Minimizar menú lateral"}
            title={`${mini ? "Expandir" : "Minimizar"} menú (⌘B)`}
            onClick={() => setMini(!mini)}
          >
            {mini ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            <DataStatus />
            <ThemeToggle />
          </div>
        </header>
        {session.appMode === "demo" && (
          <div role="status" className="mx-4 mb-2 rounded-2xl border border-dashed border-lvl-watch bg-lvl-watch/15 px-4 py-2 text-sm sm:mx-6">
            <strong>Entorno de demostración.</strong> Puede incluir repeticiones de tormentas pasadas, siempre rotuladas como REPLAY. No usar para decidir.
          </div>
        )}
        <main id="main" className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-28 sm:px-6 md:pb-8">
          {children}
        </main>
      </div>

      {/* Navegación inferior en móvil */}
      <nav className="glass-strong fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-3xl p-1.5 md:hidden" aria-label="Navegación principal">
        {NAV.slice(0, 4).concat(NAV[6]).map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-medium text-muted-foreground", active && "bg-primary text-primary-foreground")}>
              <n.icon className="size-5" aria-hidden />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavLink({ href, icon: Icon, label, active, mini }: { href: string; icon: typeof Gauge; label: string; active: boolean; mini: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={mini ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--glass-strong)] hover:text-foreground",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        mini && "mx-auto size-12 justify-center rounded-full p-0",
      )}
    >
      <Icon className="size-[1.1rem] shrink-0" aria-hidden />
      {!mini && <span>{label}</span>}
    </Link>
  );
}

function AccountButton({ mini }: { mini: boolean }) {
  const { accounts, user } = useSession();
  const router = useRouter();
  if (!accounts) {
    return null;
  }
  if (!user) {
    return (
      <Link href="/ingresar" className={cn("flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium hover:bg-[var(--glass-strong)]", mini && "justify-center")}>
        <LogIn className="size-4" /> {!mini && "Ingresar"}
      </Link>
    );
  }
  return (
    <button
      onClick={async () => {
        await api("/auth/logout", { method: "POST" }).catch(() => {});
        router.replace("/resumen");
        router.refresh();
      }}
      className={cn("flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm hover:bg-[var(--glass-strong)]", mini && "justify-center")}
      title={user.email}
    >
      <LogOut className="size-4 shrink-0" />
      {!mini && <span className="min-w-0 truncate">Salir · {user.email}</span>}
    </button>
  );
}

const noopSubscribe = () => () => {};

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // true solo en el cliente: evita el parpadeo de ícono por diferencia con el render del servidor.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button variant="glass" size="icon" aria-label={dark ? "Usar tema claro" : "Usar tema oscuro"} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
