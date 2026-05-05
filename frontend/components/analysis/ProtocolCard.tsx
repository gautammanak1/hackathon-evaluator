"use client";

import { GlowBadge } from "@/components/ui/GlowBadge";

export function ProtocolCard({ title, ok, details }: { title: string; ok: boolean; details?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <GlowBadge text={ok ? "Implemented" : "Missing"} intent={ok ? "success" : "danger"} />
      </div>
      <p className="text-xs text-slate-300">{details || "No details available."}</p>
    </div>
  );
}
