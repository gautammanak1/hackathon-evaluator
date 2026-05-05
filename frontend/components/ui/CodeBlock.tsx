"use client";

import * as React from "react";

export function CodeBlock({ code, language = "text" }: { code: string; language?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70">
      <div className="border-b border-white/10 px-3 py-1 text-xs text-slate-400">{language}</div>
      <pre className="overflow-x-auto p-3 text-xs text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}
