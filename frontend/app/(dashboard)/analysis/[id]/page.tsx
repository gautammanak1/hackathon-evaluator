"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { DocLinkCard } from "@/components/analysis/DocLinkCard";
import { IssuePanel } from "@/components/analysis/IssuePanel";
import { SuggestionAccordion } from "@/components/analysis/SuggestionAccordion";
import { fetchEvaluationById } from "@/lib/api";

export default function AnalysisDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { data } = useSWR(id ? ["analysis", id] : null, () => fetchEvaluationById(id));
  if (!data) return <div className="text-sm text-slate-300">Loading...</div>;
  const issues = data.issues ?? [];
  const suggestions = data.suggestions ?? data.report_v2?.suggestions ?? [];
  const docLinks = data.doc_links ?? data.report_v2?.doc_links ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold text-white">Deep Analysis</h1>
      <IssuePanel issues={issues} />
      <SuggestionAccordion suggestions={suggestions} />
      <div className="grid gap-3 md:grid-cols-2">{docLinks.map((d, i) => <DocLinkCard key={`${d.doc_url}-${i}`} item={d} />)}</div>
    </div>
  );
}
