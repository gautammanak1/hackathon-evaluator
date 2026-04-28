"use client";

import { Loader2 } from "lucide-react";

export function Loader({ label = "Analyzing repository…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gh-border bg-gh-card px-4 py-3 text-sm text-gh-muted">
      <Loader2 className="h-4 w-4 animate-spin text-gh-accent" />
      <span>{label}</span>
    </div>
  );
}
