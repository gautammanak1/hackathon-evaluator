const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

let lastCall = 0;
const MIN_INTERVAL_MS = 2000;

export async function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastCall));
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCall = Date.now();
  return fn();
}

export async function fetchHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = performance.now();
  try {
    const r = await fetch(`${API_BASE}/health`, { method: "GET", cache: "no-store" });
    return { ok: r.ok, latencyMs: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - t0) };
  }
}

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

/** Nested copy of graph-era fields when GET /evaluation/:id returns canonical-only root keys. */
export type ReportLegacySlice = {
  agents_detected?: number;
  uagents_usage?: boolean;
  chat_protocol?: { implemented: boolean; details: string };
  payment_protocol?: { implemented: boolean; details: string };
  asi1_llm_integration?: { implemented: boolean; details: string };
  tech_stack?: string[];
};

export type EvaluationResult = {
  repo_name: string;
  project_name?: string;
  submission_metadata?: Record<string, unknown>;
  submission_id?: string;
  evaluation_steps?: Array<Record<string, unknown>>;
  /** Present on live evaluate response; may be absent on GET-by-id until resolver reads report_legacy. */
  agents_detected?: number;
  uagents_usage?: boolean;
  chat_protocol?: { implemented: boolean; details: string };
  asi1_llm_integration?: { implemented: boolean; details: string };
  payment_protocol?: { implemented: boolean; details: string };
  tech_stack?: string[];
  quality_score?: number;
  issues?: string[];
  summary?: string;
  notes?: string;
  problem_solved?: string;
  solution_overview?: string;
  classification?: string;
  protocol_validation?: ProtocolValidation;
  scores?: Record<string, unknown>;
  benchmark?: BenchmarkBlock;
  report_v2?: ReportV2;
  report_legacy?: ReportLegacySlice;
  batch_label?: string;
  evaluation_status?: string;
  /** When persisted evaluation matches canonical envelope (GET /evaluation/:id). */
  submission_type?: string;
  source_url?: string;
  analysis?: {
    idea?: { problem_statement?: string; solution?: string };
    implementation?: Record<string, unknown>;
  };
};

export type BatchResultEntry = EvaluationResult | { error: string; repo_url?: string; label?: string };

export function isBatchError(r: BatchResultEntry): r is { error: string; repo_url?: string; label?: string } {
  return typeof r === "object" && r !== null && "error" in r;
}

export type SubmissionOutcome =
  | { mode: "single"; evaluation: EvaluationResult; count: 1; notice?: string | null; submission_id?: string }
  | { mode: "batch"; results: BatchResultEntry[]; count: number; notice?: string | null; submission_ids?: string[] };

export async function evaluateSubmission(form: FormData, signal?: AbortSignal): Promise<SubmissionOutcome> {
  return throttle(async () => {
    const res = await fetch(`${API_BASE}/evaluate/submission`, {
      method: "POST",
      body: form,
      signal,
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
      submission_id?: string | null;
      submission_ids?: string[] | null;
    };
    if (data.mode === "batch" && data.results) {
      return { mode: "batch", results: data.results, count: data.count, notice: data.notice, submission_ids: data.submission_ids ?? undefined };
    }
    if (data.evaluation == null) {
      throw new Error("Unexpected empty evaluation response");
    }
    return {
      mode: "single",
      evaluation: data.evaluation,
      count: 1,
      notice: data.notice,
      submission_id: data.submission_id ?? data.evaluation.submission_id,
    };
  });
}

export type EvaluateRepoOptions = {
  branch?: string;
  submission_context?: string;
  submission_metadata?: Record<string, unknown>;
};

export async function evaluateRepo(
  repoUrl: string,
  options?: EvaluateRepoOptions,
  signal?: AbortSignal,
): Promise<EvaluationResult> {
  return throttle(async () => {
    const u = repoUrl.trim();
    if (!u) throw new Error("GitHub URL required");
    const body: Record<string, unknown> = { repo_url: u };
    if (options?.branch?.trim()) body.branch = options.branch.trim();
    if (options?.submission_context?.trim()) body.submission_context = options.submission_context.trim();
    if (options?.submission_metadata && Object.keys(options.submission_metadata).length > 0) {
      body.submission_metadata = options.submission_metadata;
    }
    const res = await fetch(`${API_BASE}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    const d = (await res.json()) as { evaluation: EvaluationResult; submission_id?: string };
    if (d.submission_id) {
      return { ...d.evaluation, submission_id: d.submission_id };
    }
    return d.evaluation;
  });
}

export async function evaluateBatchUpload(file: File, signal?: AbortSignal): Promise<{ results: BatchResultEntry[]; count: number }> {
  return throttle(async () => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/evaluate/batch/upload`, {
      method: "POST",
      body: fd,
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    return (await res.json()) as { results: BatchResultEntry[]; count: number };
  });
}

export async function fetchEvaluationById(submissionId: string, signal?: AbortSignal): Promise<EvaluationResult | null> {
  const res = await fetch(`${API_BASE}/evaluation/${encodeURIComponent(submissionId)}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const row = (await res.json()) as EvaluationResult & { _persist?: Record<string, unknown> };
  return row;
}

/** Removes persisted evaluation from server DB (404 if missing). */
export async function deleteEvaluationById(submissionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/evaluation/${encodeURIComponent(submissionId)}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new Error("Evaluation not found");
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export { API_BASE };
