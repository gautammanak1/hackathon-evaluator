"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { Menu, Settings, X } from "lucide-react";
import { API_BASE, fetchHealth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const MOBILE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/evaluate", label: "New evaluation" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/results", label: "Latest result" },
  { href: "/docs", label: "Help" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { data: health } = useSWR("health", fetchHealth, { refreshInterval: 15000 });

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <header
        className={cn(
          "no-print fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-between border-b border-gh-border bg-gh-lightgray px-3 md:px-4",
          "dark:bg-[#141414]",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-gh-text md:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="truncate text-base font-bold text-gh-text">
            Hackathon Evaluator
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="hidden items-center gap-2 rounded-none border border-gh-border bg-gh-card px-2 py-1 font-mono text-[10px] text-gh-text sm:flex"
            title={`API ${API_BASE}`}
          >
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-full border border-gh-text",
                health?.ok ? "bg-gh-text dark:bg-white" : "bg-gh-subtle",
              )}
              aria-hidden
            />
            <span>{health?.ok ? "API" : "Offline"}</span>
            {health?.latencyMs != null && <span className="text-gh-muted">{health.latencyMs}ms</span>}
          </div>
          <ThemeToggle />
          <Link
            href="/settings"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-gh-text transition-colors hover:border-gh-text hover:bg-gh-card dark:hover:bg-[#1f1f1f]"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm dark:bg-black/70"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-[min(280px,90vw)] flex-col border-r border-gh-border bg-gh-card shadow-lg dark:bg-[#1a1a1a]">
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
                    "border-b border-gh-border py-3 transition-colors hover:bg-gh-lightgray dark:hover:bg-[#252525]",
                    pathname === l.href ? "font-bold text-gh-text" : "text-gh-muted",
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
