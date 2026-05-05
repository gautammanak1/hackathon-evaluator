"use client";

import { motion } from "framer-motion";

export function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const circumference = 2 * Math.PI * 50;
  const offset = circumference * (1 - pct / 100);
  return (
    <div className="relative h-36 w-36">
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" className="fill-none stroke-white/10" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r="50"
          className="fill-none stroke-cyan-400"
          strokeWidth="10"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-2xl font-bold text-white">{score.toFixed(1)}</div>
    </div>
  );
}
