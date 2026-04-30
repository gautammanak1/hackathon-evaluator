"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import type { EvaluationResult } from "@/lib/api";
import { resolveRepoHttps } from "@/lib/evaluate-prefill";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Safe text inside Mermaid node labels / participant aliases (avoid quotes that break parsing). */
function sanitizeFlowLabel(s: string, max = 52): string {
  return s
    .replace(/[#"`]/g, "")
    .replace(/[[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "repository";
}

function sanitizeStep(s: string): string {
  return sanitizeFlowLabel(s, 56);
}

/** Short display for the analyzed GitHub repo (owner/repo or project name). */
export function repoDisplayForDiagram(ev: EvaluationResult): string {
  const url = resolveRepoHttps(ev);
  if (url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.replace(/^\/+|\/$/g, "").split("/").filter(Boolean);
      if (parts.length >= 2) return sanitizeFlowLabel(`${parts[0]}/${parts[1]}`, 44);
    } catch {
      /* noop */
    }
  }
  const n =
    ev.repo_name?.trim() ||
    ev.report_v2?.repo_name?.trim() ||
    ev.project_name?.trim() ||
    (typeof ev.submission_metadata?.repository === "string" ? ev.submission_metadata.repository.trim() : "") ||
    "";
  return n ? sanitizeFlowLabel(n, 44) : "repository";
}

function inferSubmissionType(ev: EvaluationResult): string {
  const t = ev.submission_type?.trim();
  if (t) return t;
  if (ev.batch_label != null) return "batch_csv";
  return "github";
}

function buildSequenceDiagram(ev: EvaluationResult): string {
  const repo = repoDisplayForDiagram(ev);
  const repoParticipant = repo.replace(/\//g, " · ");
  const steps =
    (ev.evaluation_steps as Array<{ name?: string; node_key?: string }> | undefined)?.filter(Boolean) ?? [];

  let out =
    "sequenceDiagram\n  autonumber\n  participant U as Client\n  participant API as Evaluator API\n";
  out += `  participant R as ${repoParticipant}\n`;
  out += `  U->>API: Evaluate repository\n`;
  out += `  Note right of R: analyzed target\n`;
  out += `  API->>R: git clone shallow + scan files\n`;
  out += `  R-->>API: source tree + text excerpts\n`;
  out += `  Note over API: Pipeline on ${repoParticipant}\n`;

  if (steps.length === 0) {
    out += `  API->>API: ingest ... judge ... report\n`;
  } else {
    for (const s of steps.slice(0, 14)) {
      const label = sanitizeStep(String(s.name ?? s.node_key ?? "step"));
      out += `  API->>API: ${label}\n`;
    }
  }
  out += `  API-->>U: Evaluation JSON + scores\n`;
  return out;
}

function buildWorkflowDiagram(ev: EvaluationResult): string {
  const repo = repoDisplayForDiagram(ev);
  const short = repo.replace(/\//g, "_");
  const t = inferSubmissionType(ev).toLowerCase();

  if (t.includes("pdf") || t === "pdf") {
    return `flowchart LR
  pdf["PDF submission"] --> txt["Extract text"]
  txt --> urls["Find GitHub URLs"]
  urls --> pick["Resolve repo"]
  pick --> target["Analyze ${short}"]
  target --> scan["Scan clone + heuristics"]
  scan --> judge["Judge + report"]
  judge --> out["This results page"]`;
  }

  if (t.includes("batch") || t.includes("csv") || t.includes("github_with_document") || t.includes("spreadsheet")) {
    return `flowchart LR
  sheet["Spreadsheet row"] --> url["Repo URL cell"]
  url --> clone["git clone ${short}"]
  clone --> files["Read repo files"]
  files --> score["Score + protocols"]
  score --> done["Stored evaluation"]`;
  }

  return `flowchart LR
  url["Repo URL"] --> c["Clone ${short}"]
  c --> f["Scan · protocols · LLM judge"]
  f --> r["Canonical report"]
  r --> p["Results · diagrams"]`;
}

export function EvaluationFlowDiagrams({ ev }: { ev: EvaluationResult }) {
  const seqRef = React.useRef<HTMLDivElement>(null);
  const flowRef = React.useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const uid = React.useId().replace(/:/g, "");
  const repoLabel = repoDisplayForDiagram(ev);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const m = await import("mermaid");
        const theme = resolvedTheme === "dark" ? "dark" : "default";
        m.default.initialize({
          startOnLoad: false,
          theme,
          securityLevel: "strict",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        });
        const seq = buildSequenceDiagram(ev);
        const flow = buildWorkflowDiagram(ev);
        const r1 = await m.default.render(`seq-${uid}`, seq);
        const r2 = await m.default.render(`flow-${uid}`, flow);
        if (cancelled) return;
        if (seqRef.current) seqRef.current.innerHTML = r1.svg;
        if (flowRef.current) flowRef.current.innerHTML = r2.svg;
      } catch {
        if (!cancelled && seqRef.current) seqRef.current.textContent = "Diagram render failed — see Raw report tab.";
        if (!cancelled && flowRef.current) flowRef.current.innerHTML = "";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ev, resolvedTheme, uid]);

  return (
    <section className="space-y-3 no-print">
      <h2 className="text-lg font-bold text-gh-text">Workflow diagrams</h2>
      <p className="text-sm text-gh-muted">
        Diagrams reference this run&apos;s analyzed repository{" "}
        <span className="rounded bg-gh-lightgray px-1.5 py-0.5 font-mono text-xs text-gh-text dark:bg-[#252525]">
          {repoLabel}
        </span>
        . Steps mirror server pipeline metadata where recorded.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-xl border-gh-border bg-gh-card dark:border-neutral-600 dark:bg-[#141414]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-gh-text">Sequence · clone &amp; pipeline</CardTitle>
            <CardDescription className="font-mono text-xs">
              Repo participant: <span className="text-gh-text">{repoLabel}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-2 pt-0 [&_svg]:max-h-[min(420px,55vh)] [&_svg]:h-auto [&_svg]:w-full">
            <div ref={seqRef} className="flex min-h-[120px] justify-center text-xs text-gh-muted" />
          </CardContent>
        </Card>
        <Card className="rounded-xl border-gh-border bg-gh-card dark:border-neutral-600 dark:bg-[#141414]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-gh-text">Workflow · this repository</CardTitle>
            <CardDescription className="font-mono text-xs">
              Path: <span className="text-gh-text">{inferSubmissionType(ev)}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-2 pt-0 [&_svg]:max-h-[min(420px,55vh)] [&_svg]:h-auto [&_svg]:w-full">
            <div ref={flowRef} className="flex min-h-[120px] justify-center text-xs text-gh-muted" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
