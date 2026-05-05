"use client";

import useSWR from "swr";
import Link from "next/link";
import { ExternalLink, FileWarning, GitBranch, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Stats = {
  total_users: number;
  total_evaluations: number;
  total_issues_created: number;
  average_score: number | null;
  last_24h_evaluations: number;
};

type RecentEval = {
  id: string;
  repo_url: string;
  repo_owner: string;
  repo_name: string;
  score: number | null;
  classification: string | null;
  github_login: string | null;
  github_issue_url: string | null;
  created_at: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminOverviewPage() {
  const { data: stats } = useSWR<Stats>("/api/admin/stats", fetcher);
  const { data: recentRes } = useSWR<{ items: RecentEval[] }>(
    "/api/admin/evaluations?limit=15",
    fetcher,
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gh-muted">Admin overview</p>
        <h1 className="text-3xl font-semibold tracking-tight">Activity dashboard</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <StatTile icon={<Users className="h-4 w-4" />} label="Users" value={stats?.total_users ?? "—"} />
        <StatTile
          icon={<GitBranch className="h-4 w-4" />}
          label="Evaluations"
          value={stats?.total_evaluations ?? "—"}
        />
        <StatTile
          icon={<FileWarning className="h-4 w-4" />}
          label="GitHub issues"
          value={stats?.total_issues_created ?? "—"}
        />
        <StatTile
          icon={<Sparkles className="h-4 w-4" />}
          label="Avg score"
          value={typeof stats?.average_score === "number" ? stats.average_score.toFixed(1) : "—"}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent evaluations</h2>
          <span className="font-mono text-[11px] text-gh-muted">
            Last 24h: {stats?.last_24h_evaluations ?? "—"}
          </span>
        </div>
        <Card className="border-gh-border bg-gh-card/60">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gh-border text-left font-mono text-[11px] uppercase tracking-[0.18em] text-gh-muted">
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2">Repo</th>
                    <th className="px-4 py-2">Score</th>
                    <th className="px-4 py-2">Issue</th>
                    <th className="px-4 py-2 text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {!recentRes && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 font-mono text-xs text-gh-muted">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {recentRes?.items?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 font-mono text-xs text-gh-muted">
                        No evaluations yet.
                      </td>
                    </tr>
                  )}
                  {recentRes?.items?.map((r) => (
                    <tr key={r.id} className="border-b border-gh-border/60 hover:bg-fetch-soft">
                      <td className="px-4 py-2 font-mono text-[11px] text-gh-muted">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">{r.github_login ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-[12px]">
                        {r.repo_owner}/{r.repo_name}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {typeof r.score === "number" ? r.score.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {r.github_issue_url ? (
                          <a
                            href={r.github_issue_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-fetchai-pink hover:underline"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-gh-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/results/${r.id}`}
                          className="text-xs text-gh-text hover:text-fetchai-purple"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="overflow-hidden border-gh-border bg-gh-card/60">
      <div className="h-px w-full bg-[#000D3E]/10" />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-gh-muted">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums text-gh-text">{value}</p>
      </CardContent>
    </Card>
  );
}
