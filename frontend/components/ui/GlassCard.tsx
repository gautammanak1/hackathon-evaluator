"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function GlassCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-cyan-300/20 bg-white/5 p-4 backdrop-blur-xl dark:bg-slate-900/30",
        className,
      )}
      {...props}
    />
  );
}
