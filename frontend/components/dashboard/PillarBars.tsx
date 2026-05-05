"use client";

import { motion } from "framer-motion";

export function PillarBars({ scores }: { scores: Record<string, number> }) {
  return (
    <div className="space-y-2">
      {Object.entries(scores).map(([k, v], i) => (
        <div key={k}>
          <div className="mb-1 flex justify-between text-xs text-slate-300">
            <span>{k.replace(/_/g, " ")}</span>
            <span>{v}/10</span>
          </div>
          <div className="h-2 rounded bg-white/10">
            <motion.div
              className="h-2 rounded bg-gradient-to-r from-cyan-400 to-violet-400"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (v / 10) * 100)}%` }}
              transition={{ delay: i * 0.05 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
