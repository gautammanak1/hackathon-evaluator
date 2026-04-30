"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const PIPELINE_STEPS = [
  "repo_ingestion",
  "code_analysis",
  "protocol_validation",
  "feature_detection",
  "knowledge_grounding",
  "benchmark_compare",
  "evaluation",
  "report_generator",
] as const;

const LABELS: Record<(typeof PIPELINE_STEPS)[number], string> = {
  repo_ingestion: "Repo ingestion",
  code_analysis: "Code analysis",
  protocol_validation: "Protocol validation",
  feature_detection: "Feature detection",
  knowledge_grounding: "Knowledge grounding",
  benchmark_compare: "Benchmark compare",
  evaluation: "Evaluation",
  report_generator: "Report generation",
};

/** Simulated step progression while waiting for API (~8 steps). */
export function usePipelineTicker(loading: boolean, done: boolean): number {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (!loading || done) {
      if (done) setStep(PIPELINE_STEPS.length - 1);
      return;
    }
    setStep(0);
    const t = window.setInterval(() => {
      setStep((s) => Math.min(s + 1, PIPELINE_STEPS.length - 2));
    }, 2200);
    return () => clearInterval(t);
  }, [loading, done]);
  return done ? PIPELINE_STEPS.length - 1 : step;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.065, delayChildren: 0.05 },
  },
};

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 380, damping: 26 },
  },
};

/** Horizontal “pipe chain” for quick scanning — complements the vertical timeline. */
export function PipelineFlowStrip({
  activeStep,
  loading = false,
  embedded = false,
}: {
  activeStep: number;
  loading?: boolean;
  /** Inside {@link TerminalChrome} — drops outer panel chrome. */
  embedded?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto px-1 py-2",
        embedded
          ? "mt-4 border-t border-dashed border-gh-border/70 pt-4 dark:border-emerald-900/35"
          : "mt-5 rounded-lg border border-dashed border-gh-border/80 bg-gh-lightgray/40 px-2 py-2.5 dark:bg-[#1a1a1a]/80",
      )}
    >
      <motion.div
        className="flex min-w-max items-center gap-1 px-1"
        animate={loading ? { opacity: [0.92, 1, 0.92] } : {}}
        transition={loading ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        {PIPELINE_STEPS.map((step, i) => {
          const done = loading ? i < activeStep : i <= activeStep;
          const cur = loading && i === activeStep;
          const muted = !done && !cur;
          return (
            <React.Fragment key={step}>
              {i > 0 && (
                <motion.span
                  className={cn("select-none text-gh-muted", done ? "text-gh-text dark:text-white" : "")}
                  animate={loading && cur ? { x: [0, 3, 0] } : {}}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  aria-hidden
                >
                  <ChevronRight className="h-4 w-4" />
                </motion.span>
              )}
              <span
                className={cn(
                  "whitespace-nowrap rounded px-2 py-1 font-mono text-[10px] transition-colors sm:text-[11px]",
                  done &&
                    "bg-zinc-800 text-zinc-50 dark:bg-emerald-950/90 dark:text-emerald-50 dark:ring-1 dark:ring-emerald-600/45",
                  cur &&
                    loading &&
                    "bg-emerald-600/20 ring-1 ring-emerald-500/40 dark:bg-emerald-500/15 dark:ring-emerald-400/45",
                  muted &&
                    "border border-transparent text-zinc-500 dark:text-emerald-400/75",
                )}
              >
                {LABELS[step]}
              </span>
            </React.Fragment>
          );
        })}
      </motion.div>
    </div>
  );
}

type Props = {
  activeStep: number;
  loading: boolean;
};

export function EvaluationTimeline({ activeStep, loading }: Props) {
  return (
    <div className="relative pl-1">
      {/* Animated spine */}
      <motion.div
        className="pointer-events-none absolute bottom-2 left-[11px] top-2 w-px bg-gradient-to-b from-gh-border via-gh-text/35 to-gh-border dark:via-white/25"
        aria-hidden
        animate={loading ? { opacity: [0.45, 1, 0.45] } : { opacity: 1 }}
        transition={loading ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
      />

      <motion.ol
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative space-y-0 py-1"
        aria-label="Evaluation pipeline"
      >
        {PIPELINE_STEPS.map((step, i) => {
          const isComplete =
            (!loading && i <= activeStep) || (loading && activeStep < PIPELINE_STEPS.length && i < activeStep);
          const isCurrent = loading && i === activeStep;
          return (
            <motion.li key={step} variants={rowVariants} className="relative pb-5 last:pb-0">
              <motion.span
                layout
                className={cn(
                  "absolute -left-[5px] top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[10px] font-mono shadow-sm",
                  isComplete && "border-gh-text bg-gh-text text-gh-bg dark:border-white dark:bg-white dark:text-black",
                  isCurrent &&
                    "border-gh-blue bg-gh-lightgray text-gh-text ring-2 ring-gh-text/15 ring-offset-2 ring-offset-gh-bg dark:ring-white/20 dark:ring-offset-[#0c0c0c]",
                  !isComplete && !isCurrent && "border-gh-border bg-gh-card text-gh-muted",
                )}
                animate={
                  isCurrent
                    ? { scale: [1, 1.06, 1], boxShadow: ["0 0 0 0 rgba(0,0,0,0)", "0 0 0 6px rgba(0,0,0,0.08)", "0 0 0 0 rgba(0,0,0,0)"] }
                    : isComplete
                      ? { scale: [1, 1.05, 1] }
                      : {}
                }
                transition={
                  isCurrent
                    ? { duration: 1.25, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.35 }
                }
                aria-hidden
              >
                {isComplete ? (
                  <Check className="h-3 w-3 stroke-[3]" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </motion.span>
              <span
                className={cn(
                  "block pl-8 font-mono text-[11px] leading-[22px] transition-colors duration-200 sm:text-xs",
                  isComplete && "font-medium text-zinc-900 dark:text-emerald-400",
                  isCurrent && "text-zinc-900 dark:text-emerald-300",
                  !isComplete && !isCurrent && "text-zinc-500 dark:text-emerald-500/85",
                )}
              >
                <span className="mr-2 inline-block w-6 font-mono text-[9px] text-zinc-500 opacity-90 dark:text-emerald-600">
                  [{String(i + 1).padStart(2, "0")}]
                </span>
                <span className="text-emerald-700 dark:text-emerald-600">$</span> {LABELS[step]}
              </span>
              {loading && isCurrent && (
                <motion.div
                  className="mt-1.5 ml-8 h-0.5 max-w-[160px] overflow-hidden rounded-full bg-emerald-500/25 dark:bg-emerald-400/20"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div
                    className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
                    initial={{ width: "12%" }}
                    animate={{ width: ["18%", "88%", "40%", "95%", "55%"] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.div>
              )}
            </motion.li>
          );
        })}
      </motion.ol>
    </div>
  );
}
