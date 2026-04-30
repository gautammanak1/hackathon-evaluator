import type { EvaluationResult } from "@/lib/api";

/** Session key: results → protocol cards → /evaluate */
export const EVALUATE_PROTOCOL_PREFILL_KEY = "he:evaluate-protocol-prefill";

/** Query param that triggers loading prefilled payload from sessionStorage */
export const EVALUATE_PREFILL_QUERY = "evaluate-prefill";

export type ProtocolFocus = "chat" | "payment" | "llm" | "uagents";

export type EvaluateProtocolPrefill = {
  repoUrl: string;
  submission_context: string;
  branch?: string;
  focus?: ProtocolFocus;
};

type EvExt = EvaluationResult & {
  source_url?: string;
  analysis?: { idea?: { problem_statement?: string } };
};

/** Resolve HTTPS repo URL from stored evaluation (canonical GET merges fields). */
export function resolveRepoHttps(ev: EvaluationResult): string | null {
  const ext = ev as EvExt;
  const meta = ev.submission_metadata as Record<string, unknown> | undefined;

  const candidates: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) candidates.push(v.trim());
  };

  push(ev.repo_name);
  push(ev.report_v2?.repo_name);
  push(ev.project_name);
  push(ext.source_url);
  push(meta?.repo_url);
  push(meta?.repository);
  push(meta?.github_url);

  for (const raw of candidates) {
    const url = normalizeRepoInput(raw);
    if (url) return url;
  }
  return null;
}

function normalizeRepoInput(raw: string): string | null {
  if (!raw || raw === "—") return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (!u.hostname.endsWith("github.com")) return null;
      const seg = u.pathname.replace(/^\/+|\/$/g, "").replace(/\.git$/i, "");
      const parts = seg.split("/").filter(Boolean);
      if (parts.length >= 2) return `https://github.com/${parts[0]}/${parts[1]}`;
      return null;
    } catch {
      return null;
    }
  }
  const path = raw.replace(/^\/+/, "").replace(/\.git$/i, "");
  if (!path.includes("/")) return null;
  return `https://github.com/${path}`;
}

export function prepareChatProtocolPrefill(ev: EvaluationResult): EvaluateProtocolPrefill | null {
  const repoUrl = resolveRepoHttps(ev);
  if (!repoUrl) return null;
  return {
    repoUrl,
    focus: "chat",
    submission_context: buildChatProtocolPrefillContext(ev),
  };
}

export function preparePaymentProtocolPrefill(ev: EvaluationResult): EvaluateProtocolPrefill | null {
  const repoUrl = resolveRepoHttps(ev);
  if (!repoUrl) return null;
  return {
    repoUrl,
    focus: "payment",
    submission_context: buildPaymentPrefillContext(ev),
  };
}

export function prepareLlmProtocolPrefill(ev: EvaluationResult): EvaluateProtocolPrefill | null {
  const repoUrl = resolveRepoHttps(ev);
  if (!repoUrl) return null;
  return {
    repoUrl,
    focus: "llm",
    submission_context: buildLlmPrefillContext(ev),
  };
}

export function prepareUagentsProtocolPrefill(ev: EvaluationResult): EvaluateProtocolPrefill | null {
  const repoUrl = resolveRepoHttps(ev);
  if (!repoUrl) return null;
  return {
    repoUrl,
    focus: "uagents",
    submission_context: buildUagentsPrefillContext(ev),
  };
}

export function buildChatProtocolPrefillContext(ev: EvaluationResult): string {
  const lines: string[] = ["[Opened from results — Chat protocol focus]", ""];
  const pv = ev.report_v2?.protocol_validation ?? ev.protocol_validation;
  const cp = ev.chat_protocol ?? ev.report_legacy?.chat_protocol;

  if (pv?.chat) lines.push(`Heuristic validation: ${pv.chat}`);
  for (const n of pv?.chat_notes ?? []) {
    if (n?.trim()) lines.push(`• ${n.trim()}`);
  }
  if (cp?.details && cp.details !== "—") lines.push("", `Assessment: ${cp.details}`);
  const feat = ev.report_v2?.features?.chat_protocol;
  if (feat !== undefined) lines.push("", `report_v2.features.chat_protocol: ${feat}`);
  return lines.join("\n").trim().slice(0, 7800);
}

function buildPaymentPrefillContext(ev: EvaluationResult): string {
  const lines: string[] = ["[Opened from results — Payment protocol focus]", ""];
  const pv = ev.report_v2?.protocol_validation ?? ev.protocol_validation;
  const pp = ev.payment_protocol ?? ev.report_legacy?.payment_protocol;

  if (pv?.payment) lines.push(`Heuristic validation: ${pv.payment}`);
  for (const n of pv?.payment_notes ?? []) {
    if (n?.trim()) lines.push(`• ${n.trim()}`);
  }
  if (pp?.details && pp.details !== "—") lines.push("", `Assessment: ${pp.details}`);
  const feat = ev.report_v2?.features?.payment_protocol;
  if (feat !== undefined) lines.push("", `report_v2.features.payment_protocol: ${feat}`);
  return lines.join("\n").trim().slice(0, 7800);
}

function buildLlmPrefillContext(ev: EvaluationResult): string {
  const lines: string[] = ["[Opened from results — ASI-1 / LLM integration focus]", ""];
  const llm = ev.asi1_llm_integration ?? ev.report_legacy?.asi1_llm_integration;
  if (llm?.details && llm.details !== "—") lines.push(`Assessment: ${llm.details}`);
  const notes = ev.report_v2?.notes ?? ev.notes;
  if (typeof notes === "string" && notes.trim()) lines.push("", `Notes: ${notes.trim().slice(0, 2000)}`);
  const feat = ev.report_v2?.features?.llm_integration;
  if (feat !== undefined) lines.push("", `report_v2.features.llm_integration: ${feat}`);
  return lines.join("\n").trim().slice(0, 7800);
}

function buildUagentsPrefillContext(ev: EvaluationResult): string {
  const lines: string[] = ["[Opened from results — uAgents framework focus]", ""];
  lines.push(`Agents detected: ${ev.agents_detected ?? ev.report_legacy?.agents_detected ?? 0}`);
  lines.push(`uAgents usage flag: ${ev.uagents_usage ?? ev.report_legacy?.uagents_usage ?? ev.report_v2?.features?.uagents ?? "—"}`);
  const leg = ev.report_legacy?.uagents_usage;
  if (typeof leg === "boolean") lines.push(`report_legacy.uAgents: ${leg}`);
  return lines.join("\n").trim().slice(0, 7800);
}
