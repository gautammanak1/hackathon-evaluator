import type { EvaluationResult } from "@/lib/api";

export type ProtocolPrintRow = {
  label: string;
  ok: boolean;
  detail: string;
};

function legacy(ev: EvaluationResult) {
  return ev.report_legacy;
}

function protoBlock(raw: unknown): { implemented: boolean; details: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.implemented !== "boolean") return null;
  const d = o.details;
  const details = typeof d === "string" && d.trim() ? d : "—";
  return { implemented: o.implemented, details };
}

function resolveImplemented(
  direct: ReturnType<typeof protoBlock>,
  fromLeg: ReturnType<typeof protoBlock>,
  feat: boolean | undefined,
): boolean {
  if (direct) return direct.implemented;
  if (fromLeg) return fromLeg.implemented;
  return !!feat;
}

function pickDetail(direct: ReturnType<typeof protoBlock>, fromLeg: ReturnType<typeof protoBlock>): string | undefined {
  if (direct?.details && direct.details !== "—") return direct.details;
  if (fromLeg?.details && fromLeg.details !== "—") return fromLeg.details;
  if (direct?.details) return direct.details;
  if (fromLeg?.details) return fromLeg.details;
  return undefined;
}

/** Normalize protocol / feature signals for display and print when root keys are missing (GET-by-id canonical payloads). */
export function resolveProtocolRows(ev: EvaluationResult): ProtocolPrintRow[] {
  const leg = legacy(ev);
  const rv2 = ev.report_v2;

  const uRoot = typeof ev.uagents_usage === "boolean" ? ev.uagents_usage : undefined;
  const uLeg = typeof leg?.uagents_usage === "boolean" ? leg.uagents_usage : undefined;
  const uFeat = rv2?.features?.uagents;
  const uagentsOk = uRoot ?? uLeg ?? !!uFeat;

  const agents =
    typeof ev.agents_detected === "number"
      ? ev.agents_detected
      : typeof leg?.agents_detected === "number"
        ? leg.agents_detected
        : 0;

  const chatDirect = protoBlock(ev.chat_protocol);
  const chatLeg = protoBlock(leg?.chat_protocol);
  const chatOk = resolveImplemented(chatDirect, chatLeg, rv2?.features?.chat_protocol);
  let chatDetail = pickDetail(chatDirect, chatLeg);
  if (!chatDetail || chatDetail === "—") {
    const pv = rv2?.protocol_validation;
    if (pv) {
      const bits = [pv.chat, ...(pv.chat_notes || [])].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (bits.length) chatDetail = bits.join(" · ");
    }
  }
  chatDetail = chatDetail ?? "—";

  const payDirect = protoBlock(ev.payment_protocol);
  const payLeg = protoBlock(leg?.payment_protocol);
  const payOk = resolveImplemented(payDirect, payLeg, rv2?.features?.payment_protocol);
  let payDetail = pickDetail(payDirect, payLeg);
  if (!payDetail || payDetail === "—") {
    const pv = rv2?.protocol_validation;
    if (pv) {
      const bits = [pv.payment, ...(pv.payment_notes || [])].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (bits.length) payDetail = bits.join(" · ");
    }
  }
  payDetail = payDetail ?? "—";

  const llmDirect = protoBlock(ev.asi1_llm_integration);
  const llmLeg = protoBlock(leg?.asi1_llm_integration);
  const llmOk = resolveImplemented(llmDirect, llmLeg, rv2?.features?.llm_integration);
  let llmDetail = pickDetail(llmDirect, llmLeg);
  if (!llmDetail || llmDetail === "—") {
    const n = rv2?.notes;
    if (typeof n === "string" && n.trim()) llmDetail = n.trim().slice(0, 800);
  }
  llmDetail = llmDetail ?? "—";

  return [
    { label: "uAgents framework", ok: uagentsOk, detail: `Agent instances detected: ${agents}` },
    { label: "Chat protocol", ok: chatOk, detail: chatDetail },
    { label: "Payment protocol", ok: payOk, detail: payDetail },
    { label: "ASI1 / LLM integration", ok: llmOk, detail: llmDetail },
  ];
}
