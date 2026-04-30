"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Download, RefreshCw, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { API_BASE, deleteEvaluationById } from "@/lib/api";
import type { EvaluationResult } from "@/lib/api";
import { useEvaluation } from "@/context/EvaluationContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BatchResultEntry } from "@/lib/api";
import { isBatchError } from "@/lib/api";
import { removeRecentEntry } from "@/lib/stats-storage";

type ListingRow = {
  submission_id: string;
  created_at?: string;
  status?: string;
  project_name?: string | null;
  team_name?: string | null;
  score?: number | null;
  classification?: string | null;
};

type SortDir = "asc" | "desc";
type SortKey = "score" | "name" | "team" | "date";

async function fetchListings(): Promise<{ items: ListingRow[] }> {
  const r = await fetch(`${API_BASE}/evaluations?limit=200&offset=0`, { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fromBatch(entries: BatchResultEntry[]): ListingRow[] {
  const rows: ListingRow[] = [];
  for (const e of entries) {
    if (isBatchError(e)) continue;
    const ev = e as EvaluationResult & { submission_id?: string };
    if (!ev.submission_id) continue;
    rows.push({
      submission_id: ev.submission_id,
      project_name: ev.repo_name,
      team_name:
        typeof ev.submission_metadata?.team_name === "string" ? ev.submission_metadata.team_name : null,
      score:
        typeof ev.quality_score === "number"
          ? ev.quality_score
          : typeof (ev as { scores?: { final_score?: number } }).scores?.final_score === "number"
            ? (ev as { scores?: { final_score?: number } }).scores!.final_score!
            : null,
      classification: ev.classification || String(ev.scores?.classification ?? "") || null,
      status: "complete",
    });
  }
  return rows;
}

export default function LeaderboardPage() {
  const { batch } = useEvaluation();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [scoreRange, setScoreRange] = React.useState<[number, number]>([0, 10]);
  const [sortKey, setSortKey] = React.useState<SortKey>("score");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const { data, isLoading, error, mutate } = useSWR("evaluations-board", fetchListings, {
    refreshInterval: 8000,
  });

  const merged = React.useMemo(() => {
    const byId = new Map<string, ListingRow>();
    for (const row of data?.items ?? []) {
      if (row.submission_id) byId.set(row.submission_id, { ...row });
    }
    for (const r of batch ? fromBatch(batch) : []) {
      if (!byId.has(r.submission_id)) byId.set(r.submission_id, r);
    }
    return Array.from(byId.values());
  }, [batch, data?.items]);

  const filtered = React.useMemo(() => {
    let rows = [...merged];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.project_name || "").toLowerCase().includes(q) ||
          (r.team_name || "").toLowerCase().includes(q) ||
          (r.submission_id || "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      rows = rows.filter((r) => (r.status || "complete").toLowerCase() === statusFilter.toLowerCase());
    }
    rows = rows.filter((r) => {
      const s = typeof r.score === "number" ? r.score : NaN;
      if (Number.isNaN(s)) return true;
      return s >= scoreRange[0] && s <= scoreRange[1];
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "score") {
        const sa = typeof a.score === "number" ? a.score : -1;
        const sb = typeof b.score === "number" ? b.score : -1;
        return (sa - sb) * dir;
      }
      if (sortKey === "name") {
        return ((a.project_name || "").localeCompare(b.project_name || "")) * dir;
      }
      if (sortKey === "team") {
        return ((a.team_name || "").localeCompare(b.team_name || "")) * dir;
      }
      return ((a.created_at || "").localeCompare(b.created_at || "")) * dir;
    });
    return rows;
  }, [merged, scoreRange, search, sortDir, sortKey, statusFilter]);

  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function confirmDeleteServerRow() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteEvaluationById(pendingDelete);
      removeRecentEntry(pendingDelete);
      toast.success("Evaluation deleted");
      await mutate();
    } catch {
      toast.error("Could not delete");
      removeRecentEntry(pendingDelete);
      await mutate();
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "score" ? "desc" : "asc");
    }
  };

  const SortIcon =
    sortDir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  function exportCsv() {
    const lines = [["rank", "project", "team", "score", "classification", "status", "id"].join(",")];
    filtered.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          JSON.stringify(r.project_name ?? ""),
          JSON.stringify(r.team_name ?? ""),
          r.score ?? "",
          JSON.stringify(r.classification ?? ""),
          r.status ?? "",
          r.submission_id,
        ].join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leaderboard-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV downloaded");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leaderboard-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("JSON downloaded");
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gh-text">Leaderboard</h1>
        <p className="font-mono text-xs text-gh-muted">Batch + persisted evaluations ({filtered.length} shown)</p>
      </div>

      <Card className="rounded-xl border-gh-border bg-gh-lightgray dark:bg-[#141414]">
        <CardHeader className="py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gh-muted" aria-hidden />
              <Input
                placeholder="Search project name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-gh-border bg-gh-card pl-8 text-gh-text dark:bg-[#1a1a1a]"
              />
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <span className="font-mono text-xs text-gh-text">Score {scoreRange[0]}–{scoreRange[1]}</span>
              <Slider
                value={scoreRange}
                min={0}
                max={10}
                step={0.5}
                onValueChange={(v) => setScoreRange([v[0], v[1]])}
                className="w-[200px]"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] border-gh-border bg-gh-card dark:bg-[#1a1a1a]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="border-gh-border bg-gh-card dark:border-neutral-700 dark:bg-[#1a1a1a]">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={`${sortKey}:${sortDir}`}
              onValueChange={(v) => {
                const [k, d] = v.split(":") as [SortKey, SortDir];
                setSortKey(k);
                setSortDir(d);
              }}
            >
              <SelectTrigger className="w-[180px] border-gh-border bg-gh-card dark:bg-[#1a1a1a]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="border-gh-border bg-gh-card dark:border-neutral-700 dark:bg-[#1a1a1a]">
                <SelectItem value="score:desc">Score descending</SelectItem>
                <SelectItem value="score:asc">Score ascending</SelectItem>
                <SelectItem value="name:asc">Name</SelectItem>
                <SelectItem value="team:asc">Team</SelectItem>
                <SelectItem value="date:desc">Newest first</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="ml-auto gap-2 border-gh-border bg-gh-card dark:bg-[#1a1a1a]"
              onClick={() => mutate()}
            >
              <RefreshCw className="h-4 w-4" />
              Reset refresh
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="text-sm font-medium text-gh-text">Export results:</span>
            <Button type="button" size="sm" variant="outline" className="border-gh-border bg-gh-card dark:bg-[#1a1a1a]" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button type="button" size="sm" variant="outline" className="border-gh-border bg-gh-card dark:bg-[#1a1a1a]" onClick={exportJson}>
              JSON
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="overflow-hidden rounded-xl border-gh-border bg-gh-card dark:bg-[#141414]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gh-lightgray/90 dark:bg-[#252525]/95">
                <TableRow className="border-gh-border hover:bg-transparent dark:border-neutral-700">
                  <TableHead className="w-[60px] text-gh-text">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline" onClick={() => toggleSort("name")}>
                      Rank / Project
                      <SortIcon className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead className="text-black">Team</TableHead>
                  <TableHead className="text-black">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline" onClick={() => toggleSort("score")}>
                      Score
                      <SortIcon className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead className="text-gh-text">Classification</TableHead>
                  <TableHead className="text-gh-text">Status</TableHead>
                  <TableHead className="text-right text-gh-text">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full bg-gh-subtle/50 dark:bg-neutral-700" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {error && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-gh-text">
                      API unavailable. Evaluate something first or ensure the backend is running.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  filtered.map((r, i) => (
                    <TableRow
                      key={r.submission_id}
                      className={cn(
                        "cursor-pointer border-gh-border transition-colors duration-100 hover:bg-gh-lightgray motion-safe:animate-[fadeIn_200ms_ease-out_forwards] dark:border-neutral-700 dark:hover:bg-[#252525]",
                        i % 2 === 0 ? "bg-gh-card dark:bg-transparent" : "bg-gh-lightgray/50 dark:bg-[#1f1f1f]/60",
                      )}
                      style={{ animationDelay: `${Math.min(i, 40) * 50}ms` }}
                    >
                      <TableCell className="font-mono text-xs text-gh-text">{i + 1}. {r.project_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-gh-text">{r.team_name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-gh-text">{r.score != null ? Number(r.score).toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-gh-text">{r.classification ?? "—"}</TableCell>
                      <TableCell
                        className={cn(
                          (r.status || "").toLowerCase() === "error" && "underline",
                          !(r.status || "").toLowerCase() && "",
                        )}
                      >
                        {r.status ?? "complete"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/results/${r.submission_id}`} className="text-gh-blue underline dark:text-sky-400">
                            View
                          </Link>
                          <button
                            type="button"
                            className="inline-flex rounded p-1 text-gh-muted transition-colors hover:bg-gh-lightgray hover:text-gh-red dark:hover:bg-[#252525]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete(r.submission_id);
                            }}
                            aria-label="Delete evaluation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          {!isLoading && filtered.length === 0 && (
            <div className="p-12 text-center text-sm text-gh-muted">
              No evaluations yet.
              {" "}
              <Link href="/evaluate" className="underline text-gh-text">
                Run an evaluation
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !deleting && !o && setPendingDelete(null)}>
        <DialogContent className="rounded-none border-gh-border bg-gh-card sm:rounded-none">
          <DialogHeader>
            <DialogTitle className="text-gh-text">Delete evaluation?</DialogTitle>
            <DialogDescription className="font-mono text-xs text-gh-muted">
              Removes this report from the server database. Local “recent” entries are cleared too. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="border-gh-border" disabled={deleting} onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-gh-red text-gh-red hover:bg-gh-red/10 dark:border-red-400 dark:text-red-400"
              disabled={deleting}
              onClick={() => void confirmDeleteServerRow()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
