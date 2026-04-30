"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type { EvaluationResult } from "@/lib/api";
import { resolveProtocolRows } from "@/lib/evaluation-protocol";
import {
  EVALUATE_PROTOCOL_PREFILL_KEY,
  EVALUATE_PREFILL_QUERY,
  prepareChatProtocolPrefill,
  prepareLlmProtocolPrefill,
  preparePaymentProtocolPrefill,
  prepareUagentsProtocolPrefill,
  type EvaluateProtocolPrefill,
} from "@/lib/evaluate-prefill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function scoreFraction(score: number): string {
  const n = Math.min(10, Math.max(0, Number(score) || 0));
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)}/10`;
}

function ImplementedBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-mono text-xs font-semibold",
        ok ? "text-emerald-700 dark:text-emerald-400" : "text-gh-muted",
      )}
    >
      {ok ? (
        <>
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Implemented
        </>
      ) : (
        "Not implemented"
      )}
    </span>
  );
}

type Props = {
  ev: EvaluationResult;
  score: number;
};

/** Judge-facing rubric snapshot aligned with hackathon scoring signals. */
export function JudgeReportOverview({ ev, score }: Props) {
  const router = useRouter();
  const rows = resolveProtocolRows(ev);
  const [uagentsRow, chatRow, paymentRow, llmRow] = rows;

  function pushEvaluatePrefill(getPayload: () => EvaluateProtocolPrefill | null) {
    const data = getPayload();
    if (!data) {
      toast.error("No GitHub repository found — ensure this run has a repo URL or source_url in the saved report.");
      return;
    }
    try {
      sessionStorage.setItem(EVALUATE_PROTOCOL_PREFILL_KEY, JSON.stringify(data));
      router.push(`/evaluate?tab=repo&from=${EVALUATE_PREFILL_QUERY}`);
    } catch {
      toast.error("Could not open Run evaluation.");
    }
  }

  const legacyTech = ev.tech_stack?.length ? ev.tech_stack : ev.report_legacy?.tech_stack ?? [];
  const repoTitle = ev.repo_name || ev.project_name || ev.report_v2?.repo_name || "—";
  const pv = ev.report_v2?.protocol_validation ?? ev.protocol_validation;
  const bench = ev.benchmark ?? ev.report_v2?.benchmark;

  return (
    <section aria-label="Judge rubric snapshot" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Card className="rounded-xl border-gh-border bg-gh-card shadow-sm dark:border-neutral-600 dark:shadow-none">
        <CardHeader className="pb-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gh-muted">Quality score</p>
          <p className="text-4xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{scoreFraction(score)}</p>
          <p className="mt-2 text-xs leading-snug text-gh-muted">
            Weighted on uAgents, chat, LLM, payments, structure. Judge-facing summary — rubric alignment for marking.
          </p>
        </CardHeader>
      </Card>

      <Card className="rounded-xl border-gh-border bg-gh-card shadow-sm dark:border-neutral-600 dark:shadow-none">
        <CardHeader className="pb-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gh-muted">Repo</p>
          <p className="text-lg font-semibold leading-tight text-gh-text">{repoTitle}</p>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm text-gh-muted">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gh-muted">Tech stack</p>
            <div className="flex flex-wrap gap-1.5">
              {legacyTech.length > 0 ? (
                legacyTech.map((t) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="rounded-md border-gh-border bg-gh-lightgray font-mono text-[11px] text-gh-text dark:bg-[#252525]"
                  >
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="font-mono text-xs">—</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ProtocolJudgeCard
        title="uAgents framework"
        ok={uagentsRow.ok}
        detail={uagentsRow.detail}
        footerHint="Agents detected in repo scan. Click — re-run with uAgents-focused submission context."
        onActivate={() => pushEvaluatePrefill(() => prepareUagentsProtocolPrefill(ev))}
      />

      <ProtocolJudgeCard
        title="Chat protocol"
        ok={chatRow.ok}
        detail={chatRow.detail}
        footerHint="Click — re-run with chat-protocol validation notes in Custom submission context."
        onActivate={() => pushEvaluatePrefill(() => prepareChatProtocolPrefill(ev))}
      />

      <ProtocolJudgeCard
        title="ASI-1 / LLM integration"
        ok={llmRow.ok}
        detail={llmRow.detail}
        footerHint="Click — re-run with LLM / ASI-1 notes prefilled."
        onActivate={() => pushEvaluatePrefill(() => prepareLlmProtocolPrefill(ev))}
      />

      <ProtocolJudgeCard
        title="Payment protocol"
        ok={paymentRow.ok}
        detail={paymentRow.detail}
        footerHint="Click — re-run with payment-protocol notes prefilled."
        onActivate={() => pushEvaluatePrefill(() => preparePaymentProtocolPrefill(ev))}
      />

      <Card className="rounded-xl border-gh-border bg-gh-card shadow-sm sm:col-span-2 xl:col-span-1 dark:border-neutral-600 dark:shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gh-muted">Protocol validation (heuristic)</p>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 font-mono text-xs leading-relaxed text-gh-muted">
          <p>
            <span className="text-gh-text">Payment:</span>{" "}
            <span className="text-sky-700 dark:text-sky-400">{pv?.payment ?? "—"}</span>
          </p>
          <p>
            <span className="text-gh-text">Chat:</span>{" "}
            <span className="text-sky-700 dark:text-sky-400">{pv?.chat ?? "—"}</span>
          </p>
          {(pv?.payment_notes?.length || pv?.chat_notes?.length) ? (
            <ul className="list-inside list-disc text-[11px]">
              {(pv?.payment_notes ?? []).map((n, i) => (
                <li key={`p-${i}`}>{n}</li>
              ))}
              {(pv?.chat_notes ?? []).map((n, i) => (
                <li key={`c-${i}`}>{n}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-gh-border bg-gh-card shadow-sm sm:col-span-2 xl:col-span-2 dark:border-neutral-600 dark:shadow-none">
        <CardHeader className="pb-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gh-muted">Benchmark</p>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm">
          {bench ? (
            <>
              <p className="text-gh-muted">
                Closest:{" "}
                <span className="font-medium text-sky-700 dark:text-sky-400">{bench.closest_match ?? "—"}</span>
                <span className="text-gh-muted"> · confidence </span>
                <span className="tabular-nums text-gh-text">{bench.confidence ?? "—"}</span>
              </p>
              {bench.reason ? <p className="text-xs leading-relaxed text-gh-muted">{bench.reason}</p> : null}
            </>
          ) : (
            <p className="text-xs text-gh-muted">No benchmark block for this run.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ProtocolJudgeCard({
  title,
  ok,
  detail,
  onActivate,
  footerHint,
}: {
  title: string;
  ok: boolean;
  detail: string;
  footerHint?: string;
  onActivate?: () => void;
}) {
  const clickable = typeof onActivate === "function";
  return (
    <Card
      className={cn(
        "rounded-xl border-gh-border bg-gh-card shadow-sm dark:border-neutral-600 dark:shadow-none",
        clickable &&
          "cursor-pointer transition-colors hover:bg-gh-lightgray/50 dark:hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gh-text dark:focus-visible:ring-emerald-500",
      )}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onActivate : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate?.();
              }
            }
          : undefined
      }
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <p className="pr-2 font-medium leading-snug text-gh-text">{title}</p>
        <ImplementedBadge ok={ok} />
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm leading-relaxed text-gh-muted">{detail}</p>
        {clickable && footerHint ? (
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-sky-700 dark:text-sky-400">{footerHint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
