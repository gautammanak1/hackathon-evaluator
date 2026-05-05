"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ListTree, LogOut, PlusCircle, ShieldCheck, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/analyze", label: "Run analysis", icon: PlusCircle },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/repos", label: "Repositories", icon: ListTree },
  { href: "/admin/bulk", label: "Bulk tools", icon: Upload },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") {
    // Login page is unauthenticated — render without chrome.
    return <>{children}</>;
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  return (
    <div className="min-h-screen bg-white text-[#000D3E]">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-gh-border bg-white md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-gh-border px-4 py-4">
          <ShieldCheck className="h-5 w-5 text-[#5F38FB]" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Admin Console</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gh-muted">Fetch.ai Evaluator</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-fetch-soft text-gh-text shadow-[inset_2px_0_0_var(--fetchai-purple)]"
                    : "text-gh-muted hover:bg-fetch-soft hover:text-[#5F38FB]",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gh-border p-3">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start gap-2 text-gh-muted hover:bg-fetch-soft hover:text-[#5F38FB]"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-30 flex h-12 items-center justify-between border-b border-gh-border bg-white/95 px-4 backdrop-blur md:left-60">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-gh-muted">Admin · Fetch.ai Evaluator</p>
        <Link href="/" className="text-xs text-gh-muted hover:text-[#5F38FB]">
          Back to public site
        </Link>
      </header>

      <main className="ml-0 mt-12 min-h-[calc(100vh-3rem)] p-4 md:ml-60 md:p-8">
        {children}
      </main>
    </div>
  );
}
