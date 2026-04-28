const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export type ProtocolValidation = {
  payment: string;
  chat: string;
  payment_notes?: string[];
  chat_notes?: string[];
  disclaimer?: string;
};

export type BenchmarkBlock = {
  closest_match: string;
  confidence: number;
  similarity_good?: number | null;
  similarity_bad?: number | null;
  reason?: string;
  exemplars_good?: string[];
  exemplars_bad?: string[];
};

export type ReportV2 = {
  repo_name: string;
  score: number;
  classification: string;
  submission_metadata?: Record<string, unknown>;
  features: {
    uagents: boolean;
    chat_protocol: boolean;
    payment_protocol: boolean;
    llm_integration: boolean;
  };
  protocol_validation: ProtocolValidation;
  scores: Record<string, number>;
  benchmark: BenchmarkBlock;
  issues: string[];
  summary: string;
  notes: string;
  problem_solved?: string;
  solution_overview?: string;
};

export type EvaluationResult = {
  repo_name: string;
  submission_metadata?: Record<string, unknown>;
  agents_detected: number;
  uagents_usage: boolean;
  chat_protocol: { implemented: boolean; details: string };
  asi1_llm_integration: { implemented: boolean; details: string };
  payment_protocol: { implemented: boolean; details: string };
  tech_stack: string[];
  quality_score: number;
  issues: string[];
  summary: string;
  notes: string;
  problem_solved?: string;
  solution_overview?: string;
  classification?: string;
  protocol_validation?: ProtocolValidation;
  scores?: Record<string, number>;
  benchmark?: BenchmarkBlock;
  report_v2?: ReportV2;
  report_legacy?: Record<string, unknown>;
  batch_label?: string;
};

export type BatchResultEntry = EvaluationResult | { error: string; repo_url?: string; label?: string };

export function isBatchError(r: BatchResultEntry): r is { error: string; repo_url?: string; label?: string } {
  return typeof r === "object" && r !== null && "error" in r;
}

/** Response from POST /evaluate/submission (PDF / multipart). */
export type SubmissionOutcome =
  | { mode: "single"; evaluation: EvaluationResult; count: 1; notice?: string | null }
  | { mode: "batch"; results: BatchResultEntry[]; count: number; notice?: string | null };

export async function evaluateSubmission(form: FormData): Promise<SubmissionOutcome> {
  const res = await fetch(`${API_BASE}/evaluate/submission`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    mode: "single" | "batch";
    evaluation?: EvaluationResult | null;
    results?: BatchResultEntry[] | null;
    count: number;
    notice?: string | null;
  };
  if (data.mode === "batch" && data.results) {
    return { mode: "batch", results: data.results, count: data.count, notice: data.notice };
  }
  if (data.evaluation == null) {
    throw new Error("Unexpected empty evaluation response");
  }
  return { mode: "single", evaluation: data.evaluation, count: 1, notice: data.notice };
}

export async function evaluateRepo(repoUrl: string): Promise<EvaluationResult> {
  const u = repoUrl.trim();
  if (!u) throw new Error("GitHub URL required");
  const res = await fetch(`${API_BASE}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_url: u }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  const d = (await res.json()) as { evaluation: EvaluationResult };
  return d.evaluation;
}

export async function evaluateBatchUpload(file: File): Promise<{ results: BatchResultEntry[]; count: number }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/evaluate/batch/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return (await res.json()) as { results: BatchResultEntry[]; count: number };
}
