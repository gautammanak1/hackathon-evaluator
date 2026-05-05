"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";

type AdminUser = {
  id: string;
  github_login: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_login_at: string | null;
  evaluations_count: number;
  issues_count: number;
  average_score: number | null;
  latest_evaluation_id: string | null;
  latest_repo: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminUsersPage() {
  const { data } = useSWR<{ items: AdminUser[] }>("/api/admin/users", fetcher);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gh-muted">Admin · Users</p>
        <h1 className="text-3xl font-semibold tracking-tight">Registered users</h1>
        <p className="text-sm text-gh-muted">Everyone who signed in via GitHub.</p>
      </header>

      <Card className="border-gh-border bg-gh-card/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gh-border text-left font-mono text-[11px] uppercase tracking-[0.18em] text-gh-muted">
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Evaluations</th>
                  <th className="px-4 py-2">Issues</th>
                  <th className="px-4 py-2">Avg score</th>
                  <th className="px-4 py-2">Last login</th>
                  <th className="px-4 py-2 text-right">Latest result</th>
                </tr>
              </thead>
              <tbody>
                {!data && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 font-mono text-xs text-gh-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {data?.items?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 font-mono text-xs text-gh-muted">
                      No users yet.
                    </td>
                  </tr>
                )}
                {data?.items?.map((u) => (
                  <tr key={u.id} className="border-b border-gh-border/60 hover:bg-fetch-soft">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {u.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                        ) : (
                          <span className="inline-block h-6 w-6 rounded-full bg-gh-border" />
                        )}
                        <span className="font-mono">{u.github_login}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-gh-muted">{u.email ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{u.evaluations_count}</td>
                    <td className="px-4 py-2 tabular-nums">{u.issues_count}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {typeof u.average_score === "number" ? u.average_score.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-gh-muted">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {u.latest_evaluation_id ? (
                        <Link
                          href={`/results/${u.latest_evaluation_id}`}
                          className="text-xs font-medium text-[#5F38FB] hover:underline"
                          title={u.latest_repo ?? undefined}
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
