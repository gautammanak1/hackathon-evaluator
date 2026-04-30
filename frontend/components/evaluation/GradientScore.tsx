"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  score: number;
  className?: string;
};

export function GradientScore({ score, className }: Props) {
  const s = Math.min(10, Math.max(0, Number(score) || 0));
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={cn("relative", className)}
    >
      <div
        className="inline-flex min-w-[4.5rem] flex-col items-center justify-center rounded-lg border-2 border-gh-text bg-gh-card px-4 py-3 shadow-sm dark:border-white dark:bg-[#1a1a1a]"
        aria-label={`Quality score ${s} out of 10`}
      >
        <span className="text-3xl font-bold tabular-nums text-gh-text">{s.toFixed(1)}</span>
        <span className="mt-1 font-mono text-xs text-gh-muted">0–10 scale</span>
      </div>
    </motion.div>
  );
}
