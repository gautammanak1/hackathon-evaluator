/**
 * Derive UI-ready lists from persisted evaluation payloads (handles fast vs full,
 * string vs shaped strengths, mixed issue types).
 */

import type { EvaluationResult, ReportV2, Suggestion } from "@/lib/api";

/** Pull a labelled paragraph from the judge summary (five-section format). */
export function extractSummarySection(summary: string | undefined, header: string): string {
  if (!summary?.trim()) return "";
  const esc = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\*\\*${esc}\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\n\\*\\*|$)`,
    "i",
  );
  const m = summary.match(re);
  return (m?.[1] ?? "").trim();
}

export type StrengthRow = { title: string; evidence?: string };

export function coerceIssueStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const t =
        (typeof o.text === "string" && o.text) ||
        (typeof o.message === "string" && o.message) ||
        (typeof o.detail === "string" && o.detail) ||
        "";
      if (t.trim()) out.push(t.trim());
    }
  }
  return out;
}

function normalizeStrengthItems(raw: unknown): StrengthRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const rows: StrengthRow[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      rows.push({ title: "Strength", evidence: item.trim() });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const evidence = typeof o.evidence === "string" ? o.evidence.trim() : "";
      if (title || evidence) rows.push({ title: title || "Strength", evidence: evidence || title });
    }
  }
  return rows;
}

/** Prefer structured strengths; fall back to the judge's "Notable strengths" summary section. */
export function resolveStrengthRows(ev: EvaluationResult): StrengthRow[] {
  const v2 = ev.report_v2 as ReportV2 | undefined;
  const fromStruct = normalizeStrengthItems(v2?.strengths);
  if (fromStruct.length > 0) return fromStruct;

  const summary = v2?.summary || ev.summary || "";
  let extracted = extractSummarySection(summary, "Notable strengths (with code evidence)");
  if (!extracted) extracted = extractSummarySection(summary, "Notable strengths");
  if (extracted) {
    const chunks = extracted
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
    if (chunks.length <= 1 && extracted.length > 40) {
      return [{ title: "Judge assessment", evidence: extracted }];
    }
    return chunks.slice(0, 12).map((c, i) => ({ title: `Point ${i + 1}`, evidence: c }));
  }

  const weak = v2?.weaknesses;
  if (Array.isArray(weak) && weak.length > 0) {
    return [{ title: "Context", evidence: "Structured strengths were not stored; see weaknesses / issues for gaps." }];
  }
  return [];
}

export function fallbackSuggestionsFromIssues(issues: string[]): Suggestion[] {
  return issues.slice(0, 8).map((text, i) => ({
    id: `derived-issue-${i}`,
    severity: "medium",
    category: "quality",
    title: `Priority focus area ${i + 1}`,
    description:
      text +
      "\n\nCode-level before/after snippets are produced in **full** evaluation (suggestions stage). This card mirrors the strict-review finding.",
    file_hint: undefined,
    effort_minutes: 30,
    estimated_time_minutes: 30,
    before_code: "",
    after_code: "",
    why_this_fix: "Derived from evaluator issue list for visibility when the suggestion generator did not run (e.g. fast profile).",
  }));
}

export function mergeSuggestionsForDisplay(
  ev: EvaluationResult,
  issueStrings: string[],
): { items: Suggestion[]; isDerived: boolean } {
  const raw = ev.report_v2?.suggestions ?? ev.suggestions ?? [];
  if (Array.isArray(raw) && raw.length > 0) {
    return { items: raw as Suggestion[], isDerived: false };
  }
  if (issueStrings.length === 0) {
    return { items: [], isDerived: false };
  }
  return { items: fallbackSuggestionsFromIssues(issueStrings), isDerived: true };
}
