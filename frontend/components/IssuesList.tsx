"use client";

import { AlertTriangle } from "lucide-react";

export function IssuesList({ items }: { items: string[] }) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-gh-border bg-gh-card p-4 text-sm text-gh-muted">
        No issues flagged.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-gh-border bg-gh-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-100">
        <AlertTriangle className="h-4 w-4 text-gh-warn" />
        Issues
      </div>
      <ul className="space-y-2 text-xs text-gh-muted">
        {items.map((it, i) => (
          <li key={i} className="border-l-2 border-gh-border pl-3">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
