"use client";

import { CheckCircle2, XCircle } from "lucide-react";

export function FeatureCard({
  title,
  implemented,
  details,
}: {
  title: string;
  implemented: boolean;
  details: string;
}) {
  return (
    <div className="rounded-lg border border-gh-border bg-gh-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-100">{title}</h3>
        {implemented ? (
          <span className="inline-flex items-center gap-1 text-xs text-gh-success">
            <CheckCircle2 className="h-4 w-4" /> Implemented
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-gh-danger">
            <XCircle className="h-4 w-4" /> Missing
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gh-muted">{details}</p>
    </div>
  );
}
