import type { BatchResultEntry, EvaluationResult } from "@/lib/api";
import { isBatchError } from "@/lib/api";

const STATS_KEY = "he:stats";
const RECENT_KEY = "he:recent";
const MAX_RECENT = 30;

export type RecentEntry = {
  id: string;
  submission_id?: string;
  at: number;
  label: string;
  status: "complete" | "error" | "pending";
  score?: number;
  classification?: string;
  team?: string;
};

export type AggregatedStats = {
  totalEvaluated: number;
  sumScores: number;
  categoryCounts: Record<string, number>;
};

export function loadStats(): AggregatedStats {
  if (typeof window === "undefined") {
    return { totalEvaluated: 0, sumScores: 0, categoryCounts: {} };
  }
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { totalEvaluated: 0, sumScores: 0, categoryCounts: {} };
    return JSON.parse(raw) as AggregatedStats;
  } catch {
    return { totalEvaluated: 0, sumScores: 0, categoryCounts: {} };
  }
}

export function persistStats(s: AggregatedStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

/** Same-tab listeners (e.g. dashboard recent table) refresh when recent/localStorage changes. */
function notifyLocalListsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("he:recent-changed"));
}

export function recordEvaluationComplete(ev: EvaluationResult) {
  const s = loadStats();
  s.totalEvaluated += 1;
  const q =
    typeof ev.quality_score === "number"
      ? ev.quality_score
      : typeof ev.scores === "object" &&
          ev.scores !== null &&
          typeof (ev.scores as Record<string, unknown>).final_score === "number"
        ? ((ev.scores as Record<string, unknown>).final_score as number)
        : 0;
  s.sumScores += q;
  const c = (ev.classification || "—").toString().trim() || "—";
  s.categoryCounts[c] = (s.categoryCounts[c] || 0) + 1;
  persistStats(s);
}

export function loadRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentEntry[];
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentEntry, opts?: { silent?: boolean }) {
  const list = loadRecent();
  const next = [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  if (!opts?.silent) notifyLocalListsChanged();
}

/** Drop one recent row by id or submission_id (local sidebar list only). */
export function removeRecentEntry(targetId: string) {
  if (typeof window === "undefined" || !targetId.trim()) return;
  const list = loadRecent().filter((e) => e.id !== targetId && e.submission_id !== targetId);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  notifyLocalListsChanged();
}

export function ingestSingleResult(ev: EvaluationResult) {
  recordEvaluationComplete(ev);
  const sid = ev.submission_id;
  const score =
    typeof ev.quality_score === "number"
      ? ev.quality_score
      : typeof ev.scores === "object" &&
          ev.scores !== null &&
          typeof (ev.scores as Record<string, unknown>).final_score === "number"
        ? ((ev.scores as Record<string, unknown>).final_score as number)
        : undefined;
  pushRecent({
    id: sid ?? crypto.randomUUID(),
    submission_id: sid,
    at: Date.now(),
    label: ev.repo_name || ev.report_v2?.repo_name || ev.project_name?.trim() || "repository",
    status: "complete",
    score,
    classification: ev.classification || undefined,
    team:
      typeof ev.submission_metadata?.team_name === "string"
        ? ev.submission_metadata.team_name
        : typeof ev.submission_metadata?.team === "string"
          ? ev.submission_metadata.team
          : undefined,
  });
}

export function ingestBatchResults(rows: BatchResultEntry[]) {
  let completed = 0;
  for (const r of rows) {
    if (!isBatchError(r)) {
      recordEvaluationComplete(r);
      completed += 1;
      const sid = r.submission_id;
      const scoreBatch =
        typeof r.quality_score === "number"
          ? r.quality_score
          : typeof r.scores === "object" &&
              r.scores !== null &&
              typeof (r.scores as Record<string, unknown>).final_score === "number"
            ? ((r.scores as Record<string, unknown>).final_score as number)
            : undefined;
      pushRecent(
        {
          id: sid ?? crypto.randomUUID(),
          submission_id: sid,
          at: Date.now(),
          label: r.repo_name || "—",
          status: "complete",
          score: scoreBatch,
          classification: r.classification || undefined,
          team:
            typeof r.submission_metadata?.team_name === "string"
              ? r.submission_metadata.team_name
              : undefined,
        },
        { silent: true },
      );
    } else {
      pushRecent(
        {
          id: crypto.randomUUID(),
          at: Date.now(),
          label: (r.repo_url || r.label || "error") as string,
          status: "error",
        },
        { silent: true },
      );
    }
  }
  notifyLocalListsChanged();
  return completed;
}
