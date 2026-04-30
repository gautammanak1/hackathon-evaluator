"use client";

import type { EvaluationResult } from "@/lib/api";
import { TerminalChrome } from "@/components/evaluation/TerminalChrome";
import { cn } from "@/lib/utils";

function Block({ prompt, children }: { prompt: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1 font-mono text-[10px] text-gh-muted opacity-80 dark:text-emerald-700">{prompt}</p>
      <div className="font-mono text-xs leading-relaxed text-gh-text dark:text-emerald-100/90">{children}</div>
    </div>
  );
}

/** Judge-oriented narrative + structured signals (problem / solution / summary). Mirrors “full repo story” without embedding secrets. */
export function RepoAnalysisTerminal({ ev }: { ev: EvaluationResult }) {
  const v2 = ev.report_v2;
  const problem = ev.problem_solved ?? v2?.problem_solved ?? "";
  const solution = ev.solution_overview ?? v2?.solution_overview ?? "";
  const summary = ev.summary ?? v2?.summary ?? "";
  const tech = ev.tech_stack?.length ? ev.tech_stack : ev.report_legacy?.tech_stack ?? [];
  const issues = (ev.issues ?? v2?.issues ?? []).length;
  const steps = Array.isArray(ev.evaluation_steps) ? ev.evaluation_steps.length : 0;

  const agents =
    typeof ev.agents_detected === "number"
      ? ev.agents_detected
      : typeof ev.report_legacy?.agents_detected === "number"
        ? ev.report_legacy.agents_detected
        : 0;

  const hasBody = problem || solution || summary || tech.length || issues > 0 || steps > 0;

  if (!hasBody) {
    return (
      <TerminalChrome title="repo_analysis.txt">
        <p className="font-mono text-xs text-gh-muted dark:text-emerald-700">
          $ grep -R &quot;problem\\|solution&quot; ./report — <span className="text-gh-text dark:text-emerald-300">no extended narrative</span> in this payload.
          Re-run evaluation or ensure the judge model returned problem/solution fields.
        </p>
      </TerminalChrome>
    );
  }

  return (
    <TerminalChrome title="repo_analysis.txt">
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-gh-muted dark:text-emerald-800">
          Full repository narrative (judge view)
        </p>

        {problem ? (
          <Block prompt='$ printf "\\n--- PROBLEM ---\\n"'>
            <p className="whitespace-pre-wrap">{problem}</p>
          </Block>
        ) : null}

        {solution ? (
          <Block prompt='$ printf "\\n--- SOLUTION ---\\n"'>
            <p className="whitespace-pre-wrap">{solution}</p>
          </Block>
        ) : null}

        <Block prompt="$ stat —signals">
          <ul className="list-none space-y-0.5 font-mono text-[11px]">
            <li>
              <span className="text-gh-muted dark:text-emerald-700">pipeline_steps:</span>{" "}
              <span className={cn(steps > 0 ? "text-gh-text dark:text-emerald-300" : "")}>{steps || "—"}</span>
            </li>
            <li>
              <span className="text-gh-muted dark:text-emerald-700">agents_detected:</span>{" "}
              <span className="tabular-nums">{agents}</span>
            </li>
            <li>
              <span className="text-gh-muted dark:text-emerald-700">issues_flagged:</span>{" "}
              <span className="tabular-nums">{issues}</span>
            </li>
            <li className="pt-1">
              <span className="text-gh-muted dark:text-emerald-700">tech_stack:</span>{" "}
              {tech.length ? (
                <span className="text-gh-text dark:text-emerald-200">{tech.join(", ")}</span>
              ) : (
                "—"
              )}
            </li>
          </ul>
        </Block>

        {summary ? (
          <Block prompt='$ tail -n +1 summary.log'>
            <p className="whitespace-pre-wrap opacity-95">{summary}</p>
          </Block>
        ) : null}

        <p className="pt-2 font-mono text-[10px] text-gh-muted dark:text-emerald-900">
          # Structured signals mirror static + LLM judge output — not a third-party Gemini scrape from this UI.
        </p>
      </div>
    </TerminalChrome>
  );
}
