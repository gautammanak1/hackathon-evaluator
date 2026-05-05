"use client";

import type { DocLink } from "@/lib/api";

export function DocLinkCard({ item }: { item: DocLink }) {
  return (
    <a href={item.doc_url} target="_blank" rel="noreferrer" className="block rounded-lg border border-cyan-300/20 bg-slate-900/40 p-3 hover:bg-slate-900/70">
      <p className="text-sm font-medium text-cyan-200">{item.issue_type}</p>
      <p className="mt-1 text-xs text-slate-300">{item.explanation || "Relevant Fetch.ai documentation"}</p>
    </a>
  );
}
