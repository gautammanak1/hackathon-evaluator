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
import { EvaluationFlowDiagrams } from "@/components/evaluation/EvaluationFlowDiagrams";
import { JudgeReportOverview } from "@/components/evaluation/JudgeReportOverview";
import { RepoAnalysisTerminal } from "@/components/evaluation/RepoAnalysisTerminal";
import { JsonReportViewer } from "@/components/evaluation/JsonReportViewer";
import { EvaluationTimeline, PIPELINE_STEPS, PipelineFlowStrip } from "@/components/evaluation/EvaluationTimeline";
import { PrintProtocolChecklist } from "@/components/evaluation/PrintProtocolChecklist";
import { TerminalChrome } from "@/components/evaluation/TerminalChrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="mx-auto max-w-lg rounded-none border border-gh-border bg-gh-card p-10 text-center">
        <p className="font-mono text-sm text-gh-text">Evaluation not found or API unreachable.</p>
        <Button asChild className="mt-4 border-gh-text bg-gh-text text-gh-bg dark:border-white dark:bg-white dark:text-black" variant="default">
          <Link href="/">← Dashboard</Link>
        </Button>
      </div>
    );
  }

  const pillarScores = single.scores as Record<string, unknown> | undefined;
  const breakdown = pillarScores
    ? ["idea", "implementation", "protocol_integration", "ai_integration", "presentation"].filter((k) => k in pillarScores)
    : [];

  const steps =
    (single.evaluation_steps as Array<{ name?: string; node_key?: string; duration_ms?: number }> | undefined) || [];
  const activeTimeline =
    steps.length > 0 ? Math.min(steps.length - 1, PIPELINE_STEPS.length - 1) : PIPELINE_STEPS.length - 1;

  const scoreNum = scoreOf(single);

  return (
    <div className="relative mx-auto max-w-7xl space-y-8 print:max-w-none">
      <div className="no-print">
        <Link href="/" className="inline-flex items-center gap-2 font-mono text-sm text-gh-blue underline dark:text-sky-400">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Dashboard
        </Link>
      </div>

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
          <p className="text-sm leading-relaxed text-gh-muted">
            {single.report_v2?.solution_overview || single.solution_overview || "—"}
          </p>
        </div>
      </motion.section>

      <EvaluationFlowDiagrams ev={single} />

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

      <Card className="rounded-xl border-gh-border bg-gh-card dark:border-neutral-600 dark:bg-[#141414]">
        <CardHeader>
          <CardTitle className="text-base text-gh-text">Evaluation steps</CardTitle>
          <CardDescription className="font-mono text-xs text-gh-muted">Recorded server-side timings when available.</CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          <TerminalChrome title="server_timings.log">
            {steps.length > 0 ? (
              <>
                <ol className="space-y-2 font-mono text-[11px] text-gh-text sm:text-xs dark:text-emerald-200/95">
                  {steps.map((s, i) => (
                    <li key={i} className="flex justify-between border-b border-gh-border/60 py-1 dark:border-emerald-950/50">
                      <span>
                        <span className="mr-2 text-gh-muted dark:text-emerald-800">[{String(i + 1).padStart(2, "0")}]</span>
                        {String(s.name ?? s.node_key ?? "step")}
                      </span>
                      <span className="text-gh-muted dark:text-emerald-700">{s.duration_ms != null ? `${s.duration_ms}ms` : ""}</span>
                    </li>
                  ))}
                </ol>
                <PipelineFlowStrip activeStep={activeTimeline} embedded loading={false} />
              </>
            ) : (
              <>
                <EvaluationTimeline activeStep={activeTimeline} loading={false} />
                <PipelineFlowStrip activeStep={activeTimeline} embedded loading={false} />
              </>
            )}
          </TerminalChrome>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 rounded-none border-b border-gh-border bg-transparent p-0">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent text-gh-muted data-[state=active]:border-gh-text data-[state=active]:text-gh-text"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="raw"
            className="rounded-none border-b-2 border-transparent text-gh-muted data-[state=active]:border-gh-text data-[state=active]:text-gh-text"
          >
            Raw report
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4 pt-4">
          <Card className="rounded-xl border-gh-border bg-gh-card dark:border-neutral-600 dark:bg-[#141414]">
            <CardHeader>
              <CardTitle className="text-base text-gh-text">Summary</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-sm leading-relaxed text-gh-muted">
              {single.summary || single.report_v2?.summary || "—"}
            </CardContent>
          </Card>
          <Card className="rounded-xl border-gh-border bg-gh-card dark:border-neutral-600 dark:bg-[#141414]">
            <CardHeader>
              <CardTitle className="text-base text-gh-text">Notes</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-sm leading-relaxed text-gh-muted">
              {single.notes || single.report_v2?.notes || "—"}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="raw" className="pt-4">
          <JsonReportViewer data={single} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
