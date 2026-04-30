"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Github,
  Home,
  LayoutDashboard,
  PlusCircle,
  Trash2,
  Trophy,
} from "lucide-react";
import * as React from "react";
import toast from "react-hot-toast";
import { deleteEvaluationById } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { loadRecent, removeRecentEntry, type RecentEntry } from "@/lib/stats-storage";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/evaluate", label: "New evaluation", icon: PlusCircle },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/results", label: "Latest result", icon: LayoutDashboard },
];

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [recent, setRecent] = React.useState<RecentEntry[]>([]);

  React.useEffect(() => {
    setRecent(loadRecent().slice(0, 8));
  }, [pathname]);

  React.useEffect(() => {
    const sync = () => setRecent(loadRecent().slice(0, 8));
    window.addEventListener("he:recent-changed", sync);
    return () => window.removeEventListener("he:recent-changed", sync);
  }, []);

  return (
    <aside
      className={cn(
        "no-print hidden h-full min-h-0 shrink-0 overflow-hidden border-r border-gh-border bg-gh-lightgray transition-[width] duration-200 md:flex md:flex-col dark:bg-[#141414]",
        collapsed ? "w-[84px]" : "w-60",
        className,
      )}
    >
      {/* Collapsed: GitHub mark + expand — expanded: title row + collapse */}
      <div
        className={cn(
          "flex shrink-0 border-b border-gh-border",
          collapsed ? "flex-col items-center gap-2 px-2 py-3" : "h-12 flex-row items-center gap-2 px-3",
        )}
      >
        {collapsed ? (
          <>
            <Github className="h-8 w-8 shrink-0 text-gh-text" aria-hidden />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-lg border border-transparent text-gh-text hover:border-gh-text hover:bg-gh-card dark:hover:bg-[#1f1f1f]"
              onClick={() => setCollapsed(false)}
              aria-expanded={false}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </Button>
          </>
        ) : (
          <>
            <Github className="h-7 w-7 shrink-0 text-gh-text" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gh-text">Hackathon Evaluator</p>
              <p className="truncate font-mono text-[10px] text-gh-muted">Light / dark · sidebar</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-10 w-10 shrink-0 rounded-lg border border-transparent text-gh-text hover:border-gh-text hover:bg-gh-card dark:hover:bg-[#1f1f1f]"
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
          </>
        )}
      </div>

      <ScrollArea className={cn("flex-1 py-3", collapsed ? "px-1.5" : "px-2")}>
        <nav className="space-y-1.5" aria-label="Main">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center rounded-lg text-sm transition-colors",
                  active ? "bg-gh-text text-gh-bg dark:bg-white dark:text-black" : "text-gh-muted hover:bg-gh-card hover:text-gh-text dark:hover:bg-[#252525]",
                  collapsed
                    ? "mx-auto h-11 w-11 min-h-[44px] min-w-[44px] justify-center p-0"
                    : "gap-3 px-3 py-2",
                )}
                title={collapsed ? label : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>

        <Separator className={cn("bg-gh-border", collapsed ? "my-3" : "my-4")} />

        {!collapsed && (
          <>
            <p className="mb-2 px-2 font-mono text-[10px] font-medium uppercase tracking-wider text-gh-muted">Recent</p>
            <ul className="space-y-1">
              {recent.length === 0 && <li className="px-2 font-mono text-xs text-gh-muted">No runs yet</li>}
              {recent.map((r) => (
                <li key={r.id} className="group flex items-center gap-0.5">
                  <Link
                    href={r.submission_id ? `/results/${r.submission_id}` : "/results"}
                    className="min-w-0 flex-1 flex-col rounded-md px-2 py-1.5 text-xs hover:bg-gh-card dark:hover:bg-[#252525]"
                  >
                    <span className="truncate font-medium text-gh-text">{r.label}</span>
                    <span className="font-mono text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
                      {r.status === "error" ? (
                        "Error"
                      ) : typeof r.score === "number" ? (
                        <>
                          Score <span className="font-semibold text-gh-text">{r.score}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-2 text-gh-muted opacity-0 transition-opacity hover:bg-gh-card hover:text-gh-red group-hover:opacity-100 dark:hover:bg-[#252525]"
                    title={r.submission_id ? "Delete evaluation" : "Remove from list"}
                    aria-label="Remove from recent"
                    onClick={async (e) => {
                      e.preventDefault();
                      if (r.submission_id) {
                        try {
                          await deleteEvaluationById(r.submission_id);
                          toast.success("Evaluation deleted");
                        } catch {
                          toast.error("Could not delete on server");
                        }
                      }
                      removeRecentEntry(r.id);
                      setRecent(loadRecent().slice(0, 8));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </ScrollArea>

      <div className={cn("border-t border-gh-border", collapsed ? "flex flex-col gap-1 p-1.5" : "p-2")}>
        <a
          href="https://github.com/gautammanak1/hackathon-evaluator"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center rounded-lg text-sm text-gh-muted hover:bg-gh-card hover:text-gh-text dark:hover:bg-[#252525]",
            collapsed ? "mx-auto h-11 w-11 justify-center" : "gap-2 px-3 py-2",
          )}
          title="GitHub repository"
          aria-label="GitHub repository"
        >
          <Github className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && "Repository"}
        </a>
        <Link
          href="/docs"
          className={cn(
            "flex items-center rounded-lg text-sm text-gh-muted hover:bg-gh-card hover:text-gh-text dark:hover:bg-[#252525]",
            collapsed ? "mx-auto h-11 w-11 justify-center" : "gap-2 px-3 py-2",
          )}
          title={collapsed ? "Documentation" : undefined}
          aria-label="Documentation"
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && "Documentation"}
        </Link>
      </div>
    </aside>
  );
}
