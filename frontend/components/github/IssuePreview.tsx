"use client";

export function IssuePreview({ markdown }: { markdown: string }) {
  return <pre className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-200">{markdown}</pre>;
}
