"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Github,
  LayoutDashboard,
  PlusCircle,
  Trash2,
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
  { href: "/evaluate", label: "New analysis", icon: PlusCircle },
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
        "no-print hidden h-full min-h-0 shrink-0 overflow-hidden border-r border-gh-border bg-white transition-[width] duration-200 md:flex md:flex-col",
        collapsed ? "w-[84px]" : "w-60",
        className,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 border-b border-gh-border",
          collapsed ? "flex-col items-center gap-2 px-2 py-3" : "h-12 flex-row items-center gap-2 px-3",
        )}
      >
        {collapsed ? (
          <>
            <Github className="h-7 w-7 shrink-0 text-gh-text" aria-hidden />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-lg border border-transparent text-gh-text hover:border-gh-border hover:bg-fetch-soft"
              onClick={() => setCollapsed(false)}
              aria-expanded={false}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </Button>
          </>
        ) : (
          <>
            <Github className="h-6 w-6 shrink-0 text-gh-text" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gh-text">Fetch.ai Evaluator</p>
              <p className="truncate font-mono text-[10px] text-gh-muted">Single-repo deep review</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-10 w-10 shrink-0 rounded-lg border border-transparent text-gh-text hover:border-gh-border hover:bg-fetch-soft"
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
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center rounded-lg text-sm transition-colors",
                  active
                    ? "bg-fetch-soft text-gh-text shadow-[inset_2px_0_0_var(--fetchai-purple)]"
                    : "text-gh-muted hover:bg-fetch-soft hover:text-[#5F38FB]",
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
            <p className="mb-2 px-2 font-mono text-[10px] font-medium uppercase tracking-wider text-gh-muted">
              Recent
            </p>
            <ul className="space-y-1">
              {recent.length === 0 && <li className="px-2 font-mono text-xs text-gh-muted">No runs yet</li>}
              {recent.map((r) => (
                <li key={r.id} className="group flex items-center gap-0.5">
                  <Link
                    href={r.submission_id ? `/results/${r.submission_id}` : "/results"}
                    className="min-w-0 flex-1 flex-col rounded-md px-2 py-1.5 text-xs hover:bg-fetch-soft"
                  >
                    <span className="truncate font-medium text-gh-text">{r.label}</span>
                    <span className="font-mono text-[11px] tabular-nums text-gh-muted">
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
                    className="shrink-0 rounded-md p-2 text-gh-muted opacity-0 transition-opacity hover:bg-fetch-soft hover:text-gh-red group-hover:opacity-100"
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
            "flex items-center rounded-lg text-sm text-gh-muted hover:bg-fetch-soft hover:text-[#5F38FB]",
            collapsed ? "mx-auto h-11 w-11 justify-center" : "gap-2 px-3 py-2",
          )}
          title="Source"
          aria-label="Source"
        >
          <Github className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && "Source"}
        </a>
      </div>
    </aside>
  );
}
