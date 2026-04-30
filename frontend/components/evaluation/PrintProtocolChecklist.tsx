import type { EvaluationResult } from "@/lib/api";
import { resolveProtocolRows } from "@/lib/evaluation-protocol";

type Props = {
  ev: EvaluationResult;
};

/** Visible only when printing (browser Print / Save as PDF). Plain table so uAgents, protocols & LLM show clearly on paper. */
export function PrintProtocolChecklist({ ev }: Props) {
  const rows = resolveProtocolRows(ev);

  return (
    <section className="hidden print:block print-break border-2 border-black bg-white p-4 text-black" aria-hidden>
      <h2 className="mb-3 border-b-2 border-black pb-2 text-center text-sm font-bold uppercase tracking-wide">
        Protocol &amp; AI summary (for print / PDF)
      </h2>
      <table className="w-full border-collapse border border-black text-left text-[11px] leading-snug">
        <thead>
          <tr className="bg-[#E8E8E8]">
            <th className="border border-black p-2 font-sans">Capability</th>
            <th className="border border-black p-2 font-sans">Present</th>
            <th className="border border-black p-2 font-sans">Evidence / notes</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="border border-black p-2 font-sans font-semibold">{r.label}</td>
              <td className="border border-black p-2">{r.ok ? "Yes" : "No"}</td>
              <td className="border border-black p-2 whitespace-pre-wrap break-words">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
