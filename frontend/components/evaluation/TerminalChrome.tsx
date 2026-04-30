"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

/** Retro terminal window chrome — scanlines + title bar. Works in light & dark. */
export function TerminalChrome({ title = "eval_pipeline.log", children, className }: Props) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-gh-border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:border-emerald-900/35 dark:shadow-[inset_0_1px_0_rgba(16,185,129,0.06)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-gh-border bg-gradient-to-b from-gh-lightgray to-gh-lightgray/80 px-3 py-2 dark:border-emerald-950/60 dark:from-[#0f1512] dark:to-[#0a0f0d]">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="font-mono text-[10px] tracking-wide text-gh-muted dark:text-emerald-600/90">~/{title}</span>
      </div>
      <div className="relative min-h-[120px] bg-[#f4f4f4] p-3 dark:bg-[#020705]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45] dark:opacity-[0.35]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 3px)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 hidden opacity-30 dark:block"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(16,185,129,0.04) 3px)",
          }}
          aria-hidden
        />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
