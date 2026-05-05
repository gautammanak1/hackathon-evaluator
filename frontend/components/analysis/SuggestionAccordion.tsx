"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Suggestion } from "@/lib/api";
import { CodeDiffViewer } from "./CodeDiffViewer";
import { cn } from "@/lib/utils";

type Severity = "critical" | "high" | "medium" | "low";

function severityOf(s: Suggestion): Severity {
  const v = String(s.severity || "medium").toLowerCase();
  if (v === "critical" || v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

const SEVERITY_STYLES: Record<
  Severity,
  { wrap: string; pill: string; label: string }
> = {
  critical: {
    wrap: "border-rose-500/70 bg-rose-50",
    pill: "bg-rose-500 text-white",
    label: "CRITICAL",
  },
  high: {
    wrap: "border-rose-400 bg-rose-50/60",
    pill: "bg-rose-100 text-rose-700 ring-1 ring-rose-300",
    label: "HIGH",
  },
  medium: {
    wrap: "border-amber-400/80 bg-amber-50/50",
    pill: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
    label: "MEDIUM",
  },
  low: {
    wrap: "border-gh-border bg-gh-card",
    pill: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",
    label: "LOW",
  },
};

export function SuggestionAccordion({ suggestions }: { suggestions: Suggestion[] }) {
  const [open, setOpen] = useState<string | null>(suggestions[0]?.id ?? null);

  if (!suggestions.length) {
    return (
      <p className="text-sm text-gh-muted">No actionable fix snippets generated.</p>
    );
  }

  return (
    <div className="space-y-2">
      {suggestions.map((s) => {
        const sev = severityOf(s);
        const style = SEVERITY_STYLES[sev];
        const isOpen = open === s.id;
        return (
          <div
            key={s.id}
            className={cn(
              "rounded-lg border p-3 transition-colors",
              style.wrap,
            )}
          >
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              onClick={() => setOpen((v) => (v === s.id ? null : s.id))}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                    style.pill,
                  )}
                >
                  {style.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gh-text">{s.title}</p>
                  <p className="font-mono text-[11px] text-gh-muted">
                    ~{s.estimated_time_minutes ?? s.effort_minutes ?? "?"} min
                    {s.file_hint ? ` · ${s.file_hint}` : ""}
                  </p>
                </div>
              </div>
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0 text-gh-muted transition-transform",
                  isOpen ? "rotate-180" : "rotate-0",
                )}
              />
            </button>

            {isOpen ? (
              <div className="mt-3 space-y-3 border-t border-gh-border pt-3">
                {s.description ? (
                  <p className="text-sm leading-relaxed text-gh-text">{s.description}</p>
                ) : null}
                {s.why_this_fix ? (
                  <p className="text-xs leading-relaxed text-gh-text">
                    <span className="font-semibold">Why:</span> {s.why_this_fix}
                  </p>
                ) : null}
                <CodeDiffViewer
                  beforeCode={s.before_code || ""}
                  afterCode={s.after_code || ""}
                />
                {Array.isArray(s.implementation_steps) && s.implementation_steps.length > 0 ? (
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-gh-muted">
                      Implementation steps
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-gh-text">
                      {s.implementation_steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(s.validation_steps) && s.validation_steps.length > 0 ? (
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-gh-muted">
                      Validation steps
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-gh-text">
                      {s.validation_steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {s.doc_url ? (
                  <a
                    href={s.doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center font-mono text-[11px] text-[#5F38FB] hover:underline"
                  >
                    Reference doc →
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
