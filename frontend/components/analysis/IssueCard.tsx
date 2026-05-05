"use client";

import { cn } from "@/lib/utils";

type Severity = "critical" | "high" | "medium" | "low";

const SEVERITY_REGEX = /\[severity:\s*(critical|high|medium|low)\]/i;

function detectSeverity(issue: string): Severity {
  const match = issue.match(SEVERITY_REGEX);
  if (match) {
    return match[1].toLowerCase() as Severity;
  }
  const s = issue.toLowerCase();
  if (s.includes("critical") || s.includes("secret") || s.includes("rce") || s.includes("injection")) {
    return "critical";
  }
  if (s.includes("high") || s.includes("missing") || s.includes("invalid")) {
    return "high";
  }
  if (s.includes("low") || s.includes("nit") || s.includes("style")) {
    return "low";
  }
  return "medium";
}

const SEVERITY_STYLES: Record<
  Severity,
  { card: string; badge: string; label: string }
> = {
  critical: {
    card: "border-rose-500/70 bg-rose-50",
    badge: "border-rose-500 bg-rose-500 text-white",
    label: "CRITICAL",
  },
  high: {
    card: "border-rose-400 bg-rose-50/70",
    badge: "border-rose-500 bg-rose-100 text-rose-700",
    label: "HIGH",
  },
  medium: {
    card: "border-amber-400/80 bg-amber-50/60",
    badge: "border-amber-500 bg-amber-100 text-amber-800",
    label: "MEDIUM",
  },
  low: {
    card: "border-gh-border bg-gh-card",
    badge: "border-slate-400 bg-slate-100 text-slate-700",
    label: "LOW",
  },
};

export function IssueCard({ issue }: { issue: string }) {
  const severity = detectSeverity(issue);
  const style = SEVERITY_STYLES[severity];
  const cleanText = issue.replace(SEVERITY_REGEX, "").trim();

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        style.card,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
            style.badge,
          )}
        >
          {style.label}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-gh-text">{cleanText}</p>
    </div>
  );
}
