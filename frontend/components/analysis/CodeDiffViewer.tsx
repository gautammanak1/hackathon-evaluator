"use client";

import { CodeBlock } from "@/components/ui/CodeBlock";

export function CodeDiffViewer({ beforeCode, afterCode }: { beforeCode?: string; afterCode?: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <CodeBlock code={beforeCode || "# no before snippet"} language="before" />
      <CodeBlock code={afterCode || "# no after snippet"} language="after" />
    </div>
  );
}
