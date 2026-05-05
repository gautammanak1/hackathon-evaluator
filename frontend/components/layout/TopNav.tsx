"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import useSWR from "swr";
import { LogOut, Menu, Settings, User2, X } from "lucide-react";
import { API_BASE, fetchHealth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MOBILE_LINKS = [
  { href: "/evaluate", label: "New analysis" },
  { href: "/results", label: "Latest result" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { data: health } = useSWR("health", fetchHealth, { refreshInterval: 15000 });

  React.useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const githubLogin = session?.user?.githubLogin || session?.user?.name || "github";
  const avatar = session?.user?.image;

  return (
    <>
      <header className="no-print fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-between border-b border-gh-border bg-white/95 px-3 backdrop-blur md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-gh-text md:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/evaluate" className="flex items-center gap-2 truncate text-sm font-bold text-gh-text">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--fetchai-purple)]" />
            <span>Fetch.ai Evaluator</span>
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="hidden items-center gap-2 rounded-md border border-gh-border bg-gh-card/60 px-2 py-1 font-mono text-[10px] text-gh-text sm:flex"
            title={`API ${API_BASE}`}
          >
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-full",
                health?.ok ? "bg-[var(--fetchai-purple)]" : "bg-gh-subtle",
              )}
              aria-hidden
            />
            <span>{health?.ok ? "API" : "Offline"}</span>
            {health?.latencyMs != null && <span className="text-gh-muted">{health.latencyMs}ms</span>}
          </div>

          <Link
            href="/settings"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-gh-text transition-colors hover:border-gh-border hover:bg-fetch-soft"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-10 items-center gap-2 rounded-lg border border-gh-border bg-white px-2 text-xs text-gh-text hover:bg-fetch-soft"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-7 w-7 rounded-full" />
              ) : (
                <User2 className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden max-w-[120px] truncate sm:inline">{githubLogin}</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-48 rounded-lg border border-gh-border bg-white p-1 shadow-lg shadow-[#000D3E]/10"
              >
                <Link
                  role="menuitem"
                  href="/settings"
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-gh-text hover:bg-fetch-soft"
                >
                  <Settings className="h-3.5 w-3.5" /> Settings
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs text-gh-text hover:bg-fetch-soft"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-[#000D3E]/30 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-[min(280px,90vw)] flex-col border-r border-gh-border bg-white shadow-lg">
            <div className="flex h-12 items-center justify-between border-b border-gh-border px-3">
              <span className="font-bold text-gh-text">Menu</span>
              <button type="button" className="p-2 text-gh-text" aria-label="Close" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col p-3 font-mono text-sm">
              {MOBILE_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "border-b border-gh-border py-3 transition-colors hover:bg-fetch-soft",
                    pathname === l.href ? "font-bold text-gh-text" : "text-gh-muted",
                  )}
                >
                  {l.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="mt-2 flex items-center gap-2 py-3 text-gh-muted hover:text-gh-text"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
