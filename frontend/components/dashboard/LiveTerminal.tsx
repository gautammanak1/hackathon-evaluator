"use client";

export function LiveTerminal({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-xl border border-[#000D3E]/10 bg-[#F7F8FB] p-3 font-mono text-xs text-[#000D3E]">
      {lines.length === 0 ? (
        <p className="text-[#5C6489]">Waiting for stream...</p>
      ) : (
        lines.map((l, i) => <p key={i}>{l}</p>)
      )}
    </div>
  );
}
