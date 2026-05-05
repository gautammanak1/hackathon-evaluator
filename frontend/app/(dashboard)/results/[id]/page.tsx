"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, Download } from "lucide-react";
import toast from "react-hot-toast";
import { fetchEvaluationById } from "@/lib/api";
import type { EvaluationResult } from "@/lib/api";
import {
  coerceIssueStrings,
  mergeSuggestionsForDisplay,
  resolveStrengthRows,
  type StrengthRow,
} from "@/lib/reportDisplay";
import { JudgeReportOverview } from "@/components/evaluation/JudgeReportOverview";
import { RepoAnalysisTerminal } from "@/components/evaluation/RepoAnalysisTerminal";
import { JsonReportViewer } from "@/components/evaluation/JsonReportViewer";
import { PrintProtocolChecklist } from "@/components/evaluation/PrintProtocolChecklist";
import { IssuePanel } from "@/components/analysis/IssuePanel";
import { MermaidDiagram } from "@/components/analysis/MermaidDiagram";
import { SuggestionAccordion } from "@/components/analysis/SuggestionAccordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function scoreOf(ev: EvaluationResult | null): number {
  if (!ev) return 0;
  if (typeof ev.quality_score === "number") return ev.quality_score;
  const s = ev.scores as Record<string, unknown> | undefined;
  if (s && typeof s.final_score === "number") return s.final_score;
  return Number(ev.report_v2?.score ?? 0) || 0;
}

export default function ResultByIdPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  const { data, error, isLoading } = useSWR(id ? ["eval", id] : null, () => fetchEvaluationById(id));

  const single = data as EvaluationResult | null | undefined;

  const copyJson = () => {
    if (!single) return;
    void navigator.clipboard.writeText(JSON.stringify(single, null, 2));
    toast.success("Copied");
  };

  const downloadJson = () => {
    if (!single) return;
    const blob = new Blob([JSON.stringify(single, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const name = (single as { project_name?: string }).project_name || single.repo_name || "evaluation";
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!id) {
    return (
      <div className="mx-auto max-w-lg rounded-none border border-gh-border bg-gh-card p-10 text-center font-mono text-sm text-gh-text">
        Missing evaluation id.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-10 w-64 bg-gh-subtle/60" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40 bg-gh-lightgray dark:bg-[#252525]" />
          <Skeleton className="h-40 bg-gh-lightgray dark:bg-[#252525]" />
          <Skeleton className="h-40 bg-gh-lightgray dark:bg-[#252525]" />
        </div>
        <Skeleton className="min-h-[200px] bg-gh-lightgray/80 dark:bg-[#1f1f1f]" />
      </div>
    );
  }

  if (error || !single) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-gh-border bg-gh-card p-10 text-center">
        <p className="font-mono text-sm text-gh-text">Evaluation not found or API unreachable.</p>
        <Button asChild className="mt-4" variant="default">
          <Link href="/evaluate">Run another analysis</Link>
        </Button>
      </div>
    );
  }

  const pillarScores = single.scores as Record<string, unknown> | undefined;
  const breakdown = pillarScores
    ? ["idea", "implementation", "protocol_integration", "ai_integration", "presentation"].filter((k) => k in pillarScores)
    : [];

  const scoreNum = scoreOf(single);
  const issueUrl =
    single.github_issue_url ||
    single.report_v2?.github_issue_url ||
    single.github_issue?.issue_url ||
    null;
  const issueStrings = coerceIssueStrings(single.report_v2?.issues ?? single.issues ?? []);
  const strengthRows: StrengthRow[] = resolveStrengthRows(single);
  const { items: suggestionItems, isDerived: suggestionsDerived } = mergeSuggestionsForDisplay(single, issueStrings);
  const diagrams = single.report_v2?.diagrams || (single as { diagrams?: { workflow?: string; sequence?: string; source?: string } }).diagrams || {};
  const workflowMermaid = diagrams.workflow || "";
  const sequenceMermaid = diagrams.sequence || "";
  const diagramSource = diagrams.source || "";

  const summaryText = single.report_v2?.summary || single.summary || "";
  const notesText = single.report_v2?.notes || single.notes || "";

  return (
    <div className="relative mx-auto max-w-7xl space-y-8 print:max-w-none">
      <div className="no-print">
        <Link href="/evaluate" className="inline-flex items-center gap-2 font-mono text-sm text-gh-text/80 hover:text-gh-text">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Run another analysis
        </Link>
      </div>

      {issueUrl && (
        <div className="no-print rounded-xl border border-fetchai-purple/40 bg-fetchai-purple/10 p-4 text-sm text-gh-text">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">GitHub issue created</p>
              <p className="font-mono text-xs text-gh-muted">{issueUrl}</p>
            </div>
            <Button asChild size="sm" className="bg-[#5F38FB] text-white hover:bg-[#7A58FF]">
              <a href={issueUrl} target="_blank" rel="noreferrer">View on GitHub</a>
            </Button>
          </div>
        </div>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gh-muted">Judge workspace</p>
          <h1 className="text-2xl font-bold text-gh-text">Evaluation report</h1>
          <p className="font-mono text-xs text-gh-muted">ID: {id}</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button type="button" variant="outline" size="sm" className="border-gh-border bg-gh-card" onClick={copyJson}>
            <Copy className="h-4 w-4" /> Export JSON
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-gh-border bg-gh-card" onClick={downloadJson}>
            <Download className="h-4 w-4" /> Download
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>
      </header>

      <JudgeReportOverview ev={single} score={scoreNum} />

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-3 no-print"
      >
        <h2 className="text-lg font-bold text-gh-text">Idea &amp; problem</h2>
        <div className="rounded-xl border border-gh-border bg-gh-card/90 p-4 dark:bg-[#141414]/95">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-gh-muted">What problem it solves</p>
          <p className="text-sm leading-relaxed text-gh-text">
            {single.report_v2?.problem_solved || single.problem_solved || single.analysis?.idea?.problem_statement || "—"}
          </p>
          <p className="mb-2 mt-4 font-mono text-[10px] font-semibold uppercase tracking-wider text-gh-muted">Solution overview</p>
          <p className="text-sm leading-relaxed text-gh-text">
            {single.report_v2?.solution_overview || single.solution_overview || "—"}
          </p>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-3"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-gh-text">Detailed summary</h2>
          {notesText ? (
            <p className="font-mono text-[10px] uppercase tracking-wider text-gh-muted">
              Strict reviewer narrative
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-gh-border bg-white p-5">
          {summaryText ? (
            <div className="space-y-4 text-[15px] leading-7 text-gh-text">
              {summaryText
                .split(/\n{2,}/)
                .map((p) => p.trim())
                .filter((p) => p.length > 0)
                .map((para, i) => {
                  // Render Markdown bold headers as h3, e.g. **Problem this project solves**.
                  const headerOnly = para.match(/^\*\*(.+?)\*\*\s*$/);
                  if (headerOnly) {
                    return (
                      <h3
                        key={i}
                        className="mt-2 text-base font-semibold text-[#000D3E]"
                      >
                        {headerOnly[1].trim()}
                      </h3>
                    );
                  }
                  // Header followed inline by body on the next line(s).
                  const headerLed = para.match(/^\*\*(.+?)\*\*\s*\n([\s\S]+)$/);
                  if (headerLed) {
                    return (
                      <div key={i} className="space-y-1.5">
                        <h3 className="text-base font-semibold text-[#000D3E]">
                          {headerLed[1].trim()}
                        </h3>
                        <p className="leading-7">{headerLed[2].trim()}</p>
                      </div>
                    );
                  }
                  return <p key={i}>{para}</p>;
                })}
            </div>
          ) : (
            <p className="text-sm text-gh-muted">No summary returned by the judge.</p>
          )}
          {notesText ? (
            <div className="mt-5 border-t border-gh-border pt-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-gh-muted">
                Reviewer notes
              </p>
              <p className="text-sm leading-7 text-gh-text">{notesText}</p>
            </div>
          ) : null}
        </div>
      </motion.section>

      {(workflowMermaid || sequenceMermaid) && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-3"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-gh-text">Architecture diagrams</h2>
            {diagramSource ? (
              <p className="font-mono text-[10px] uppercase tracking-wider text-gh-muted">
                Source: {diagramSource === "llm" ? "LLM-grounded" : "deterministic fallback"}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {workflowMermaid ? (
              <MermaidDiagram source={workflowMermaid} caption="Workflow — control & data flow" />
            ) : null}
            {sequenceMermaid ? (
              <MermaidDiagram source={sequenceMermaid} caption="Sequence — representative interaction" />
            ) : null}
          </div>
        </motion.section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gh-text">Strict reviewer findings</h2>
        <IssuePanel issues={issueStrings} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gh-text">Strengths (evidence-based)</h2>
        <div className="rounded-xl border border-gh-border bg-gh-card p-4">
          {strengthRows.length > 0 ? (
            <ul className="space-y-3 text-sm text-gh-text">
              {strengthRows.map((s, idx: number) => (
                <li key={idx} className="leading-relaxed">
                  <span className="font-semibold text-gh-text">{s.title}</span>
                  {s.evidence ? (
                    <p className="mt-1 whitespace-pre-wrap text-gh-text/95">{s.evidence}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gh-muted">No evidence-backed strengths recorded.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-bold text-gh-text">Complete fix snippets</h2>
          {suggestionsDerived ? (
            <p className="font-mono text-[10px] uppercase tracking-wider text-gh-muted">
              Focus cards from findings · full snippets need eval_profile full
            </p>
          ) : null}
        </div>
        {suggestionsDerived ? (
          <p className="text-xs leading-relaxed text-gh-muted">
            Generated suggestion blocks were not stored for this run (common with <strong>fast</strong> evaluation).
            Below are actionable priorities mapped from strict-review issues. Re-run with{" "}
            <span className="font-mono text-gh-text">eval_profile: &quot;full&quot;</span> for full code diffs.
          </p>
        ) : null}
        <SuggestionAccordion suggestions={suggestionItems} />
      </section>

      <section className="space-y-2 no-print">
        <h2 className="text-lg font-bold text-gh-text">Repository narrative</h2>
        <RepoAnalysisTerminal ev={single} />
      </section>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-3"
      >
        <h2 className="text-lg font-bold text-gh-text">Detailed pillar scores</h2>
        <div className="space-y-3 rounded-xl border border-gh-border bg-gh-card/80 p-4 dark:bg-[#141414]/90">
          {(breakdown.length > 0 ? breakdown : ["architecture", "protocols", "ai_usage", "code_quality", "innovation"]).map((k) => {
            const raw =
              pillarScores && typeof pillarScores[k] === "number"
                ? (pillarScores[k] as number)
                : single.report_v2?.scores?.[k as keyof NonNullable<typeof single.report_v2.scores>];
            const v = typeof raw === "number" ? raw : 0;
            return (
              <div key={k}>
                <div className="mb-1 flex justify-between font-mono text-xs text-gh-text">
                  <span className="capitalize">{k.replace(/_/g, " ")}</span>
                  <span>{v}/10</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-gh-lightgray dark:bg-[#252525]">
                  <motion.div
                    className="h-full bg-gh-text dark:bg-white"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (v / 10) * 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </motion.section>

      <PrintProtocolChecklist ev={single} />

      <Tabs defaultValue="raw" className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 rounded-none border-b border-gh-border bg-transparent p-0">
          <TabsTrigger
            value="raw"
            className="rounded-none border-b-2 border-transparent text-gh-muted data-[state=active]:border-gh-text data-[state=active]:text-gh-text"
          >
            Raw report
          </TabsTrigger>
        </TabsList>
        <TabsContent value="raw" className="pt-4">
          <JsonReportViewer data={single} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
