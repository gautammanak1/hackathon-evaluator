"use client";

import Link from "next/link";
import useSWR from "swr";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type AdminRepo = {
  repo_owner: string;
  repo_name: string;
  evaluations_count: number;
  latest_score: number | null;
  latest_classification: string | null;
  latest_issue_url: string | null;
  last_evaluated_at: string;
  github_login: string | null;
  latest_evaluation_id: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminReposPage() {
  const { data } = useSWR<{ items: AdminRepo[] }>("/api/admin/repos", fetcher);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gh-muted">Admin · Repositories</p>
        <h1 className="text-3xl font-semibold tracking-tight">Analysed repositories</h1>
      </header>

      <Card className="border-gh-border bg-gh-card/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gh-border text-left font-mono text-[11px] uppercase tracking-[0.18em] text-gh-muted">
                  <th className="px-4 py-2">Repo</th>
                  <th className="px-4 py-2">Owner login</th>
                  <th className="px-4 py-2">Runs</th>
                  <th className="px-4 py-2">Latest score</th>
                  <th className="px-4 py-2">Classification</th>
                  <th className="px-4 py-2">Issue</th>
                  <th className="px-4 py-2">Last run</th>
                  <th className="px-4 py-2 text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {!data && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 font-mono text-xs text-gh-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {data?.items?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 font-mono text-xs text-gh-muted">
                      No repositories analysed yet.
                    </td>
                  </tr>
                )}
                {data?.items?.map((r) => (
                  <tr
                    key={`${r.repo_owner}/${r.repo_name}`}
                    className="border-b border-gh-border/60 hover:bg-fetch-soft"
                  >
                    <td className="px-4 py-2 font-mono">
                      <a
                        href={`https://github.com/${r.repo_owner}/${r.repo_name}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-fetchai-purple"
                      >
                        {r.repo_owner}/{r.repo_name}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gh-muted">{r.github_login ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{r.evaluations_count}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {typeof r.latest_score === "number" ? r.latest_score.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-2">{r.latest_classification ?? "—"}</td>
                    <td className="px-4 py-2">
                      {r.latest_issue_url ? (
                        <a
                          href={r.latest_issue_url}
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
                    <td className="px-4 py-2 font-mono text-[11px] text-gh-muted">
                      {new Date(r.last_evaluated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.latest_evaluation_id ? (
                        <Link
                          href={`/results/${r.latest_evaluation_id}`}
                          className="text-xs font-medium text-[#5F38FB] hover:underline"
                        >
                          Open →
                        </Link>
                      ) : (
                        <span className="text-gh-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
