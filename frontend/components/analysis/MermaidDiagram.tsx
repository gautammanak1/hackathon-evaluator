"use client";

import * as React from "react";

let _initialized = false;
let _idCounter = 0;
function nextId() {
  _idCounter += 1;
  return `mermaid-${Date.now().toString(36)}-${_idCounter}`;
}

async function ensureMermaid() {
  const m = (await import("mermaid")).default;
  if (!_initialized) {
    m.initialize({
      startOnLoad: false,
      theme: "neutral",
      fontFamily:
        'JetBrains Mono, ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, monospace',
      flowchart: { htmlLabels: true, curve: "basis" },
      sequence: { actorMargin: 60, mirrorActors: false, showSequenceNumbers: true },
      themeVariables: {
        primaryColor: "#EEE9FF",
        primaryTextColor: "#000D3E",
        primaryBorderColor: "#5F38FB",
        lineColor: "#5F38FB",
        secondaryColor: "#FFFFFF",
        tertiaryColor: "#F7F8FB",
        fontSize: "13px",
      },
    });
    _initialized = true;
  }
  return m;
}

export function MermaidDiagram({
  source,
  caption,
}: {
  source: string;
  caption?: string;
}) {
  const [svg, setSvg] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    let cancelled = false;
    const trimmed = (source || "").trim();
    if (!trimmed) {
      setSvg("");
      setError("");
      return;
    }
    (async () => {
      try {
        const m = await ensureMermaid();
        const id = nextId();
        const { svg: rendered } = await m.render(id, trimmed);
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) {
          setSvg("");
          setError(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <figure className="rounded-xl border border-gh-border bg-white p-4">
      {error ? (
        <div className="space-y-2">
          <p className="font-mono text-xs text-rose-700">
            Diagram failed to render: {error}
          </p>
          <pre className="overflow-auto rounded-md bg-gh-card p-3 text-xs leading-relaxed text-gh-text">
            {source}
          </pre>
        </div>
      ) : (
        <div
          className="mermaid-container w-full overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {caption ? (
        <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-wider text-gh-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
