"use client";

import { cn } from "@/lib/utils";

function scoreColor(score: number) {
  if (score >= 8) return "text-gh-success";
  if (score >= 5) return "text-gh-warn";
  return "text-gh-danger";
}

export function ScoreCard({ score }: { score: number }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-gh-border bg-gh-card p-6 glow-ring",
      )}
    >
      <div className="text-xs uppercase tracking-wider text-gh-muted">Quality score</div>
      <div className={cn("mt-2 text-5xl font-semibold", scoreColor(score))}>
        {score}
        <span className="text-2xl text-gh-muted">/10</span>
      </div>
      <p className="mt-3 text-sm text-gh-muted">Weighted on uAgents, chat, LLM, payments, structure.</p>
    </div>
  );
}
