"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Copy,
  Download,
  ExternalLink,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useEvaluation } from "@/context/EvaluationContext";
import { JsonReportViewer } from "@/components/evaluation/JsonReportViewer";
import { ScoreRadar } from "@/components/evaluation/ScoreRadar";
import { GradientScore } from "@/components/evaluation/GradientScore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EvaluationTimeline, PIPELINE_STEPS } from "@/components/evaluation/EvaluationTimeline";
import { PrintProtocolChecklist } from "@/components/evaluation/PrintProtocolChecklist";
import { resolveProtocolRows } from "@/lib/evaluation-protocol";

function classificationVariant(c?: string): "default" | "secondary" | "destructive" | "muted" | "warn" {
  const s = (c || "").toLowerCase();
  if (s.includes("poor") || s.includes("bad")) return "destructive";
  if (s.includes("avg") || s.includes("fair")) return "warn";
  if (s.includes("excellent") || s.includes("good")) return "default";
  return "secondary";
}

function featureState(ok: boolean): { label: string; variant: "default" | "secondary" | "destructive" } {
  return ok
    ? { label: "Implemented", variant: "default" }
    : { label: "Missing", variant: "destructive" };
}

export default function ResultsPage() {
  const { single, clear } = useEvaluation();

  if (!single) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-gh-border bg-gh-card p-10 text-center">
        <p className="text-gh-muted">No evaluation loaded. Run one from Evaluate.</p>
        <Button asChild className="mt-4">
          <Link href="/evaluate">New evaluation</Link>
        </Button>
      </div>
    );
  }

  const mergedAxes = {
    ...(single.report_v2?.scores ?? {}),
    ...(typeof single.scores === "object" && single.scores !== null ? single.scores : {}),
  } as Record<string, unknown>;
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(mergedAxes)) {
    if (typeof v === "number" && !Number.isNaN(v)) scores[k] = v;
  }
  const hasScores = Object.keys(scores).length > 0;
  const v2 = single.report_v2;

  const copyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(single, null, 2));
    toast.success("Copied");
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(single, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${single.repo_name || "evaluation"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const meta = single.submission_metadata || {};

  return (
    <div className="mx-auto max-w-5xl space-y-8 print:max-w-none">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between print-break">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gh-text">{single.repo_name}</h1>
            <Badge variant={classificationVariant(single.classification || v2?.classification)}>
              {single.classification || v2?.classification || "—"}
            </Badge>
          </div>
          <a
            href={`https://github.com/${single.repo_name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-gh-blue hover:underline"
          >
            View on GitHub <ExternalLink className="h-3 w-3" />
          </a>
          {Object.keys(meta).length > 0 && (
            <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-3">
              {Object.entries(meta).map(([k, v]) => (
                <div key={k} className="rounded border border-gh-border/60 bg-gh-bg/50 px-2 py-1">
                  <dt className="text-[10px] uppercase text-gh-muted">{k}</dt>
                  <dd className="truncate font-mono text-xs text-gh-text" title={String(v)}>
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <GradientScore score={typeof single.quality_score === "number" ? single.quality_score : 0} />
          <div className="flex gap-2 no-print">
            <Button variant="outline" size="sm" onClick={copyJson}>
              <Copy className="h-4 w-4" /> Copy JSON
            </Button>
            <Button variant="outline" size="sm" onClick={downloadJson}>
              <Download className="h-4 w-4" /> JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              Print / Save PDF
            </Button>
          </div>
        </div>
      </header>

      <PrintProtocolChecklist ev={single} />

      <section className="grid gap-6 md:grid-cols-2 print-break">
        {hasScores && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score breakdown</CardTitle>
              <CardDescription>0–10 per axis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="no-print">
                <ScoreRadar scores={scores} />
              </div>
              <div className="mt-4 grid gap-2">
                {Object.entries(scores).map(([k, v]) => (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-xs text-gh-muted">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help capitalize">{k.replace(/_/g, " ")}</span>
                        </TooltipTrigger>
                        <TooltipContent>Axis score from judge output</TooltipContent>
                      </Tooltip>
                      <span className="font-mono">{v}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gh-border/50">
                      <motion.div
                        className="h-full rounded-full bg-gh-green"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (Number(v) / 10) * 100)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feature detection</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {resolveProtocolRows(single).map((f) => {
              const st = featureState(f.ok);
              return (
                <motion.div
                  key={f.label}
                  initial={{ scale: 0.96 }}
                  animate={{ scale: 1 }}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                    f.ok ? "border-gh-green/40 bg-gh-green/5" : "border-gh-border bg-gh-bg",
                  )}
                >
                  <span className="text-gh-text">{f.label}</span>
                  <Badge variant={st.variant}>{f.ok ? "✓ " : "✗ "}{st.label}</Badge>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <Card className="print-break">
        <CardHeader>
          <CardTitle className="text-base">Evaluation timeline</CardTitle>
          <CardDescription>Reference pipeline (completed when report is ready).</CardDescription>
        </CardHeader>
        <CardContent>
          <EvaluationTimeline activeStep={PIPELINE_STEPS.length - 1} loading={false} />
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="code">Code analysis</TabsTrigger>
          <TabsTrigger value="protocol">Protocol validation</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
          <TabsTrigger value="raw">Raw report</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Problem solved</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-gh-muted">
                {single.problem_solved || "—"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Solution overview</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-gh-muted">
                {single.solution_overview || "—"}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gh-muted">{single.summary}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="code">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tech stack</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(single.tech_stack || []).map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
              {!(single.tech_stack || []).length && <span className="text-sm text-gh-muted">—</span>}
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(single.issues || []).map((issue, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gh-muted">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-gh-red" />
                    {issue}
                  </li>
                ))}
                {!(single.issues || []).length && <p className="text-sm text-gh-muted">No issues listed.</p>}
              </ul>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Judge notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gh-muted">{single.notes || "—"}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="protocol">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Heuristic protocol validation</CardTitle>
              <CardDescription>Static analysis — not a runtime security audit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {single.protocol_validation ? (
                <>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>
                      Chat:{" "}
                      <Badge variant="secondary">{single.protocol_validation.chat}</Badge>
                    </span>
                    <span>
                      Payment:{" "}
                      <Badge variant="secondary">{single.protocol_validation.payment}</Badge>
                    </span>
                  </div>
                  {(single.protocol_validation.payment_notes || []).length > 0 && (
                    <div>
                      <p className="mb-1 text-xs uppercase text-gh-muted">Payment notes</p>
                      <ul className="list-inside list-disc text-sm text-gh-muted">
                        {single.protocol_validation.payment_notes!.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gh-muted">No protocol_validation block in this response.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmark">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Benchmark comparison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {single.benchmark ? (
                <>
                  <p>
                    Closest: <span className="font-medium text-gh-green">{single.benchmark.closest_match}</span> ·
                    confidence {single.benchmark.confidence}
                  </p>
                  <p className="text-gh-muted">
                    sim_good {single.benchmark.similarity_good ?? "—"} · sim_bad{" "}
                    {single.benchmark.similarity_bad ?? "—"}
                  </p>
                  {single.benchmark.reason && <p className="leading-relaxed text-gh-muted">{single.benchmark.reason}</p>}
                </>
              ) : (
                <p className="text-gh-muted">No benchmark data.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw">
          <JsonReportViewer data={single} />
        </TabsContent>
      </Tabs>

      <div className="no-print flex gap-2">
        <Button variant="outline" asChild>
          <Link href="/evaluate">New run</Link>
        </Button>
        <Button variant="ghost" onClick={clear}>
          Clear from session
        </Button>
      </div>
    </div>
  );
}
