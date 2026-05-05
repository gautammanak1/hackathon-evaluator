"use client";

import { cn } from "@/lib/utils";

export function GlowBadge({ text, intent = "default" }: { text: string; intent?: "default" | "success" | "warning" | "danger" }) {
  const color =
    intent === "success"
      ? "border-emerald-400/60 text-emerald-300"
      : intent === "warning"
        ? "border-amber-400/60 text-amber-300"
        : intent === "danger"
          ? "border-rose-400/60 text-rose-300"
          : "border-cyan-400/60 text-cyan-200";
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs shadow-[0_0_16px_rgba(0,212,255,0.35)]", color)}>
      {text}
    </span>
  );
}
