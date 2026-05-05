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
  strengths?: Array<{ title?: string; evidence?: string }>;
  weaknesses?: Array<{ title?: string; severity?: string }>;
  summary: string;
  notes: string;
  problem_solved?: string;
  solution_overview?: string;
  deep_analysis?: Record<string, unknown>;
  suggestions?: Suggestion[];
  diagrams?: RepoDiagrams;
  doc_links?: DocLink[];
  github_issue_url?: string | null;
  github_issue?: {
    created?: boolean;
    issue_url?: string | null;
    reason?: string;
    auth_mode?: string;
    labels_applied?: boolean;
    user_oauth_error?: string;
  };
};

export type RepoDiagrams = {
  workflow?: string;
  sequence?: string;
  source?: "llm" | "heuristic" | string;
};

export type Suggestion = {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  category: "protocol" | "architecture" | "security" | "quality" | string;
  title: string;
  description: string;
  before_code?: string;
  after_code?: string;
  file_hint?: string;
  doc_url?: string;
  effort_minutes?: number;
  estimated_time_minutes?: number;
  fixed_code?: string;
  broken_pattern?: string;
  why_this_fix?: string;
  risk?: string;
  implementation_steps?: string[];
  validation_steps?: string[];
  tests_to_add?: string[];
};

export type DocLink = {
  issue_type: string;
  doc_url: string;
  explanation?: string;
  snippet?: string;
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
  deep_analysis?: Record<string, unknown>;
  suggestions?: Suggestion[];
  diagrams?: RepoDiagrams;
  doc_links?: DocLink[];
  github_issue_url?: string | null;
  github_issue?: {
    created?: boolean;
    issue_url?: string | null;
    reason?: string;
    auth_mode?: string;
    labels_applied?: boolean;
    user_oauth_error?: string;
  };
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
  create_github_issue?: boolean;
  github_token?: string;
  user_github_login?: string;
  /** Default **fast** everywhere unless you pass `"full"` (deep suggestions/diagrams chain). */
  eval_profile?: "full" | "fast";
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
    if (options?.create_github_issue) body.create_github_issue = true;
    if (options?.github_token?.trim()) body.github_token = options.github_token.trim();
    if (options?.user_github_login?.trim()) body.user_github_login = options.user_github_login.trim();
    body.eval_profile = options?.eval_profile ?? "fast";
    // Hits the Next.js proxy at /api/evaluate which attaches the user's GitHub
    // OAuth token (server-side only, from the NextAuth JWT) before forwarding
    // to FastAPI. That token is what we use to open the evaluation issue.
    const res = await fetch(`/api/evaluate`, {
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

export type DeepEvaluateOptions = EvaluateRepoOptions & {
  document_text?: string;
  create_github_issue?: boolean;
  github_token?: string;
};

export async function evaluateRepoDeep(repoUrl: string, options?: DeepEvaluateOptions, signal?: AbortSignal): Promise<EvaluationResult> {
  return throttle(async () => {
    const body: Record<string, unknown> = { repo_url: repoUrl.trim() };
    if (options?.branch?.trim()) body.branch = options.branch.trim();
    if (options?.submission_context?.trim()) body.submission_context = options.submission_context.trim();
    if (options?.document_text?.trim()) body.document_text = options.document_text.trim();
    if (options?.submission_metadata) body.submission_metadata = options.submission_metadata;
    if (options?.create_github_issue) body.create_github_issue = true;
    if (options?.github_token?.trim()) body.github_token = options.github_token.trim();
    body.eval_profile = options?.eval_profile ?? "fast";
    const res = await fetch(`${API_BASE}/evaluate/deep-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    const d = (await res.json()) as { evaluation: EvaluationResult; submission_id?: string };
    return d.submission_id ? { ...d.evaluation, submission_id: d.submission_id } : d.evaluation;
  });
}

export async function fetchSuggestions(submissionId: string, severity?: string): Promise<Suggestion[]> {
  const q = severity ? `?severity=${encodeURIComponent(severity)}` : "";
  const res = await fetch(`${API_BASE}/evaluate/${encodeURIComponent(submissionId)}/suggestions${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { suggestions?: Suggestion[] };
  return data.suggestions ?? [];
}

export async function createGithubIssueForEvaluation(
  submissionId: string,
  payload: { repo_url: string; github_token?: string; pr_number?: number },
): Promise<{ created: boolean; issue_url?: string | null; reason?: string }> {
  const res = await fetch(`${API_BASE}/evaluate/${encodeURIComponent(submissionId)}/create-issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { created: boolean; issue_url?: string | null; reason?: string };
}

export function streamEvaluation(
  body: Record<string, unknown>,
  handlers: { onStep?: (raw: string) => void; onDone?: (raw: string) => void; onError?: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  const payload = { ...body, eval_profile: body.eval_profile ?? "fast" };
  fetch(`${API_BASE}/evaluate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const event = /event:\s*(\w+)/.exec(part)?.[1] ?? "";
          const data = /data:\s*(.*)/.exec(part)?.[1] ?? "";
          if (event === "step") handlers.onStep?.(data);
          if (event === "done") handlers.onDone?.(data);
        }
      }
    })
    .catch((e) => handlers.onError?.(e as Error));
  return () => controller.abort();
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
