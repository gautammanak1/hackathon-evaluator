"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  evaluate: "Evaluate",
  results: "Results",
  leaderboard: "Leaderboard",
  bulk: "Leaderboard",
  docs: "Help",
  settings: "Settings",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    const label = LABELS[p] ?? p.replace(/-/g, " ");
    crumbs.push({ href: acc, label });
  }

  return (
    <nav aria-label="Breadcrumb" className="no-print border-b border-gh-border bg-gh-card px-4 py-2 text-xs text-gh-muted dark:bg-[#141414]">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="hover:underline">
            Dashboard
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.href} className="flex items-center gap-1">
            <span aria-hidden className="text-gh-subtle">
              /
            </span>
            {c.href === pathname ? (
              <span className="font-medium text-gh-text">{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:underline">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
