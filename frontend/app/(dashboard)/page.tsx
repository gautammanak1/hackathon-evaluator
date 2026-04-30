"use client";

import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadRecent, loadStats } from "@/lib/stats-storage";
import * as React from "react";
import { cn } from "@/lib/utils";

const INPUT_CARDS = [
  {
    num: "01",
    title: "GitHub Repository",
    description: "Evaluate a single public repo with optional branch and metadata.",
    href: "/evaluate?tab=repo",
  },
  {
    num: "02",
    title: "Upload PDF",
    description: "Sheet exports with embedded GitHub URLs (multi-repo detection supported).",
    href: "/evaluate?tab=pdf",
  },
  {
    num: "03",
    title: "Bulk CSV / Excel",
    description: "Upload a spreadsheet with repo URL columns for batch scoring.",
    href: "/evaluate?tab=bulk",
  },
];

export default function DashboardPage() {
  const { mutate } = useSWRConfig();
  const [mounted, setMounted] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const pageSize = 5;

  const { data: stats } = useSWR(mounted ? "local-stats" : null, () => loadStats(), { refreshInterval: 5000 });
  const { data: recentRaw } = useSWR(mounted ? "local-recent" : null, () => loadRecent(), { refreshInterval: 5000 });

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const refresh = () => {
      void mutate("local-recent");
      void mutate("local-stats");
    };
    window.addEventListener("he:recent-changed", refresh);
    return () => window.removeEventListener("he:recent-changed", refresh);
  }, [mutate]);

  const recent = recentRaw ?? [];
  const totalPages = Math.max(1, Math.ceil(recent.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = recent.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const avg =
    stats && stats.totalEvaluated > 0 ? (stats.sumScores / stats.totalEvaluated).toFixed(1) : "—";

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 pb-10">
      <header className="space-y-2 motion-safe:animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight text-gh-text">Submit & Evaluate Hackathon Projects</h1>
        <p className="max-w-2xl font-mono text-sm text-gh-muted">
          Terminal-style feedback, weighted scores, and persisted reports you can share via URL.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {INPUT_CARDS.map((c, i) => (
          <motion.div
            key={c.href}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.1 }}
          >
            <Link href={c.href}>
              <Card className="group h-full rounded-xl border border-gh-border bg-gh-card p-4 transition-colors duration-150 hover:border-gh-text dark:bg-[#141414] dark:hover:border-neutral-500">
                <div className="font-mono text-lg font-bold text-gh-text">{c.num}</div>
                <CardTitle className="mt-3 text-base font-bold text-gh-text">{c.title}</CardTitle>
                <CardDescription className="mt-2 font-mono text-xs leading-relaxed text-gh-muted">{c.description}</CardDescription>
                <div className="mt-4 border-t border-gh-border pt-3 font-mono text-xs text-gh-text underline-offset-4 group-hover:underline dark:border-neutral-700">
                  Open input
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border-gh-border bg-gh-card dark:bg-[#141414]">
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-gh-muted">Total evaluated</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-gh-text">
              {!mounted ? <Skeleton className="h-9 w-16 bg-gh-subtle/60" /> : stats?.totalEvaluated ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-xl border-gh-border bg-gh-card dark:bg-[#141414]">
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-gh-muted">Average score</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-gh-text">
              {!mounted ? <Skeleton className="h-9 w-16 bg-gh-subtle/60" /> : avg}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-xl border-gh-border bg-gh-card dark:bg-[#141414]">
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-gh-muted">Leaderboard</CardDescription>
            <CardTitle className="text-base font-semibold text-gh-text">
              <Link href="/leaderboard" className="underline">
                View persisted runs
              </Link>
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-bold text-gh-text">Recent evaluations</h2>
          <span className="font-mono text-xs text-gh-muted">
            {mounted ? (
              <>
                Page {pageSafe} of {totalPages}
              </>
            ) : (
              <span className="terminal-dots inline-block w-8" aria-hidden />
            )}
          </span>
        </div>

        <Card className="overflow-hidden rounded-xl border-gh-border bg-gh-card dark:bg-[#141414]">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gh-border hover:bg-transparent dark:border-neutral-700">
                    <TableHead className="font-mono text-gh-text">Project</TableHead>
                    <TableHead className="font-mono text-gh-text">Team</TableHead>
                    <TableHead className="font-mono text-gh-text">Score</TableHead>
                    <TableHead className="font-mono text-gh-text">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!mounted && (
                    <TableRow>
                      <TableCell colSpan={4} className="font-mono text-sm text-gh-muted">
                        Loading<span className="terminal-dots inline-block w-8 pl-1" aria-hidden />
                      </TableCell>
                    </TableRow>
                  )}
                  {mounted &&
                    slice.map((r, i) => (
                      <TableRow
                        key={r.id}
                        className={cn(
                          "cursor-pointer border-gh-border transition-colors duration-100 hover:bg-gh-lightgray motion-safe:animate-[fadeIn_200ms_ease-out_forwards] dark:border-neutral-700 dark:hover:bg-[#252525]",
                          i % 2 === 0 ? "bg-gh-card" : "bg-gh-lightgray/50 dark:bg-transparent",
                        )}
                        style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                        onClick={() => {
                          const href = r.submission_id ? `/results/${r.submission_id}` : "/results";
                          window.location.href = href;
                        }}
                      >
                        <TableCell className="font-medium text-gh-text">{r.label}</TableCell>
                        <TableCell className="font-mono text-xs text-gh-text">{r.team ?? "—"}</TableCell>
                        <TableCell className="font-mono tabular-nums text-gh-text">{r.score ?? "—"}</TableCell>
                        <TableCell
                          className={cn(
                            "font-mono text-xs",
                            r.status === "pending" && "animate-pulse text-gh-muted",
                            r.status === "complete" && "text-gh-text",
                            r.status === "error" && "text-gh-red underline",
                          )}
                        >
                          {r.status}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-gh-text">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-gh-border"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span>
            Page {pageSafe} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-gh-border"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="default">
            <Link href="/evaluate">New evaluation</Link>
          </Button>
          <Button asChild variant="outline" className="border-gh-border bg-gh-card">
            <Link href="/leaderboard">Open leaderboard</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
