"use client";

import { IssueCard } from "./IssueCard";

export function IssuePanel({ issues }: { issues: string[] }) {
  return (
    <div className="space-y-3">
      {issues.length === 0 ? (
        <p className="text-sm text-gh-muted">No strict-review issues reported.</p>
      ) : (
        issues.map((issue, i) => <IssueCard key={`${issue}-${i}`} issue={issue} />)
      )}
    </div>
  );
}
