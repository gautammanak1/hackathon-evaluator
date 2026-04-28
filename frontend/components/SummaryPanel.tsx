"use client";

export function SummaryPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-gh-border bg-[#0d1117] p-4">
      <div className="text-xs uppercase tracking-wider text-gh-muted">{title}</div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{body}</p>
    </div>
  );
}
