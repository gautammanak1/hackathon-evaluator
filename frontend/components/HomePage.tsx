"use client";

import { useMemo, useRef, useState } from "react";
import { FeatureCard } from "@/components/FeatureCard";
import { IssuesList } from "@/components/IssuesList";
import { Loader } from "@/components/Loader";
import { RepoInput } from "@/components/RepoInput";
import { ScoreCard } from "@/components/ScoreCard";
import { SiteFooter } from "@/components/SiteFooter";
import { SummaryPanel } from "@/components/SummaryPanel";
import {
  BatchResultEntry,
  EvaluationResult,
  evaluateBatchUpload,
  evaluateRepo,
  evaluateSubmission,
  isBatchError,
} from "@/lib/api";
import { Copy, Download, Github } from "lucide-react";

function rowLabel(r: BatchResultEntry): string {
  if (isBatchError(r)) return (r.repo_url || r.label || "—") as string;
  return r.repo_name || "—";
}

function rowScore(r: BatchResultEntry): string {
  if (isBatchError(r)) return "—";
  return String(r.quality_score ?? "—");
}

export function HomePage() {
  const [url, setUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);
  const [singleDetail, setSingleDetail] = useState<EvaluationResult | null>(null);
  const [batchRows, setBatchRows] = useState<BatchResultEntry[] | null>(null);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number | null>(null);

  const detail: EvaluationResult | null =
    batchRows !== null && selectedBatchIndex !== null
      ? (() => {
          const r = batchRows[selectedBatchIndex];
          return r && !isBatchError(r) ? r : null;
        })()
      : singleDetail;

  const badges = useMemo(() => {
    if (!detail) return "";
    const b = [
      `score-${detail.quality_score}`,
      detail.uagents_usage ? "uagents-yes" : "uagents-no",
      detail.chat_protocol.implemented ? "chat-yes" : "chat-no",
      detail.asi1_llm_integration.implemented ? "llm-yes" : "llm-no",
      detail.payment_protocol.implemented ? "pay-yes" : "pay-no",
    ];
    return b.join(" · ");
  }, [detail]);

  function clearPdfFile() {
    setPdfFile(null);
    const el = pdfInputRef.current;
    if (el) el.value = "";
  }

  function clearBulkFile() {
    setBulkFile(null);
    const el = bulkInputRef.current;
    if (el) el.value = "";
  }

  function onUrlChange(next: string) {
    setUrl(next);
    if (next.trim()) {
      clearPdfFile();
      clearBulkFile();
    }
  }

  function onPdfFileChange(file: File | null) {
    if (file) {
      setUrl("");
      clearBulkFile();
    }
    setPdfFile(file);
  }

  function onBulkFileChange(file: File | null) {
    if (file) {
      setUrl("");
      clearPdfFile();
    }
    setBulkFile(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBatchNotice(null);
    setSingleDetail(null);
    setBatchRows(null);
    setSelectedBatchIndex(null);

    if (bulkFile) {
      setLoading(true);
      try {
        const out = await evaluateBatchUpload(bulkFile);
        setBatchRows(out.results);
        const idx = out.results.findIndex((r) => !isBatchError(r));
        setSelectedBatchIndex(idx >= 0 ? idx : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!url.trim() && !pdfFile) {
      setError("Choose a GitHub URL, a PDF, or a CSV / Excel file.");
      return;
    }

    setLoading(true);
    try {
      if (pdfFile) {
        const fd = new FormData();
        if (url.trim()) fd.append("repo_url", url.trim());
        fd.append("pdf", pdfFile);
        const out = await evaluateSubmission(fd);
        if (out.mode === "batch") {
          setBatchRows(out.results);
          setBatchNotice(out.notice ?? null);
          const idx = out.results.findIndex((r) => !isBatchError(r));
          setSelectedBatchIndex(idx >= 0 ? idx : null);
          setSingleDetail(null);
        } else {
          setSingleDetail(out.evaluation);
          setBatchRows(null);
          setSelectedBatchIndex(null);
          if (out.notice) setBatchNotice(out.notice);
        }
      } else {
        const ev = await evaluateRepo(url.trim());
        setSingleDetail(ev);
        setBatchRows(null);
        setSelectedBatchIndex(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function copyJson() {
    if (batchRows) {
      void navigator.clipboard.writeText(JSON.stringify(batchRows, null, 2));
      return;
    }
    if (!detail) return;
    void navigator.clipboard.writeText(JSON.stringify(detail, null, 2));
  }

  function downloadJson() {
    if (batchRows) {
      const blob = new Blob([JSON.stringify(batchRows, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "batch-results.json";
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${detail.repo_name || "evaluation"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-10 pt-8 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-gh-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gh-border bg-gh-card glow-ring">
            <Github className="h-5 w-5 text-gh-accent" aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-gray-50">
                Submission Intelligence
              </span>
              <span className="rounded-full border border-gh-border bg-gh-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gh-muted">
                Evaluator
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gh-muted">Fetch.ai · ASI:One hackathon workflows</p>
          </div>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-gh-muted sm:text-right">
          Production-style reviews: clone, scan, optional doc grounding, structured scores—export JSON for
          your leaderboard.
        </p>
        </header>

        <section className="mt-10 space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-50 sm:text-4xl">
          Evaluate submissions at the speed of your event
        </h1>
        <div className="max-w-2xl space-y-3 text-sm leading-relaxed text-gh-muted">
          <p>
            Pick <strong className="font-medium text-gray-300">one</strong> path per run: a single GitHub
            repo, a PDF export (e.g. Sheets), or a CSV / Excel table. Switching inputs clears the others so
            you never mix sources by accident.
          </p>
          <p>
            Your sheet should include a URL column named{" "}
            <code className="rounded bg-[#21262d] px-1.5 py-0.5 font-mono text-xs text-gray-300">
              repo_url
            </code>
            ,{" "}
            <code className="rounded bg-[#21262d] px-1.5 py-0.5 font-mono text-xs text-gray-300">url</code>,{" "}
            <code className="rounded bg-[#21262d] px-1.5 py-0.5 font-mono text-xs text-gray-300">
              repository
            </code>
            , or{" "}
            <code className="rounded bg-[#21262d] px-1.5 py-0.5 font-mono text-xs text-gray-300">repo</code>.
            Extra columns (team, table, track) flow through as metadata on each result. Exports from Google
            Sheets to PDF with multiple <code className="font-mono text-xs text-gray-400">github.com</code>{" "}
            links are detected and evaluated as a batch when text extraction succeeds—prefer CSV or Excel if
            a PDF has no selectable text.
          </p>
        </div>
        </section>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <p className="text-xs text-gh-muted">
          Use exactly one: <span className="text-gray-400">GitHub URL</span>,{" "}
          <span className="text-gray-400">PDF</span>, or <span className="text-gray-400">CSV / Excel</span>.
          Choosing one clears the rest (including any selected file).
        </p>
        <label className="block text-xs text-gh-muted">
          GitHub URL (single repo)
          <RepoInput
            className="mt-1"
            placeholder="https://github.com/org/project"
            value={url}
            disabled={!!pdfFile || !!bulkFile}
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-xs text-gh-muted">
            PDF (e.g. Google Sheets export)
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              disabled={!!bulkFile || !!url.trim()}
              className="mt-1 block w-full text-sm text-gray-300 file:mr-3 file:rounded-md file:border file:border-gh-border file:bg-gh-card file:px-3 file:py-1.5 file:text-xs file:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(e) => onPdfFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {pdfFile ? (
            <button
              type="button"
              onClick={() => clearPdfFile()}
              className="shrink-0 rounded-md border border-gh-border bg-gh-card px-3 py-2 text-xs text-gray-200 hover:border-gh-accent"
            >
              Remove PDF
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-xs text-gh-muted">
            Bulk: CSV or Excel (.csv / .xlsx) — one repo per row
            <input
              ref={bulkInputRef}
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              disabled={!!pdfFile || !!url.trim()}
              className="mt-1 block w-full text-sm text-gray-300 file:mr-3 file:rounded-md file:border file:border-gh-border file:bg-gh-card file:px-3 file:py-1.5 file:text-xs file:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(e) => onBulkFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {bulkFile ? (
            <button
              type="button"
              onClick={() => clearBulkFile()}
              className="shrink-0 rounded-md border border-gh-border bg-gh-card px-3 py-2 text-xs text-gray-200 hover:border-gh-accent"
            >
              Remove file
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gh-accent px-4 py-2 text-sm font-medium text-[#0d1117] hover:opacity-90 disabled:opacity-50"
          >
            Run evaluation
          </button>
          {(detail || batchRows) && (
            <>
              <button
                type="button"
                onClick={copyJson}
                className="inline-flex items-center gap-2 rounded-md border border-gh-border bg-gh-card px-3 py-2 text-xs text-gray-200 hover:border-gh-accent"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy JSON
              </button>
              <button
                type="button"
                onClick={downloadJson}
                className="inline-flex items-center gap-2 rounded-md border border-gh-border bg-gh-card px-3 py-2 text-xs text-gray-200 hover:border-gh-accent"
              >
                <Download className="h-3.5 w-3.5" />
                Download JSON
              </button>
            </>
          )}
        </div>
      </form>

      {batchNotice && (
        <div className="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/25 p-3 text-sm text-amber-100">
          {batchNotice}
        </div>
      )}
      {loading && (
        <div className="mt-6">
          <Loader />
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {batchRows && batchRows.length > 0 && !loading && (
        <div className="mt-8 overflow-x-auto rounded-lg border border-gh-border bg-gh-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-gh-border text-xs uppercase text-gh-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Repo / URL</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Classification</th>
              </tr>
            </thead>
            <tbody>
              {batchRows.map((r, i) => (
                <tr
                  key={i}
                  className={`cursor-pointer border-b border-gh-border/80 hover:bg-[#010409] ${
                    selectedBatchIndex === i && !isBatchError(r) ? "bg-[#010409]" : ""
                  }`}
                  onClick={() => {
                    if (!isBatchError(r)) setSelectedBatchIndex(i);
                  }}
                >
                  <td className="px-3 py-2 text-gh-muted">{i + 1}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-gray-200" title={rowLabel(r)}>
                    {rowLabel(r)}
                  </td>
                  <td className="px-3 py-2 text-gh-accent">{rowScore(r)}</td>
                  <td className="px-3 py-2 text-gray-300">
                    {isBatchError(r) ? (
                      <span className="text-red-300">{r.error}</span>
                    ) : (
                      (r.classification ?? "—")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-gh-border px-3 py-2 text-xs text-gh-muted">
            Click a row to view full details below (errors are not selectable).
          </p>
        </div>
      )}

      {detail && !loading && (
        <div className="mt-10 space-y-6">
          <div className="text-xs text-gh-muted">{badges}</div>
          {detail.classification && (
            <div className="rounded-lg border border-gh-border bg-gh-card px-4 py-2 text-sm">
              <span className="text-gh-muted">Classification: </span>
              <span className="font-medium text-gray-200">{detail.classification}</span>
            </div>
          )}
          {detail.submission_metadata && Object.keys(detail.submission_metadata).length > 0 && (
            <div className="rounded-lg border border-gh-border bg-gh-card p-4 text-sm">
              <div className="text-xs uppercase tracking-wide text-gh-muted">Row metadata (from sheet)</div>
              <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {Object.entries(detail.submission_metadata).map(([k, v]) => (
                  <div key={k} className="flex gap-2 border-b border-gh-border/50 py-1 last:border-0">
                    <dt className="shrink-0 text-gh-muted">{k}</dt>
                    <dd className="truncate text-gray-200" title={String(v)}>
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <ScoreCard score={detail.quality_score} />
            </div>
            <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gh-border bg-gh-card p-4 text-sm">
                <div className="text-gh-muted">Repo</div>
                <div className="mt-1 text-lg text-gray-100">{detail.repo_name}</div>
                <div className="mt-2 text-xs text-gh-muted">
                  Agents detected:{" "}
                  <span className="text-gray-200">{detail.agents_detected}</span>
                </div>
                <div className="mt-1 text-xs text-gh-muted">
                  uAgents usage:{" "}
                  <span className="text-gray-200">{detail.uagents_usage ? "Yes" : "No"}</span>
                </div>
                <div className="mt-3 text-xs text-gh-muted">Tech stack</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(detail.tech_stack || []).map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-gh-border bg-[#010409] px-2 py-0.5 text-[10px] text-gray-300"
                    >
                      {t}
                    </span>
                  ))}
                  {!(detail.tech_stack || []).length && (
                    <span className="text-[10px] text-gh-muted">—</span>
                  )}
                </div>
              </div>
              <FeatureCard
                title="Chat protocol"
                implemented={detail.chat_protocol.implemented}
                details={detail.chat_protocol.details}
              />
              <FeatureCard
                title="ASI-1 / LLM integration"
                implemented={detail.asi1_llm_integration.implemented}
                details={detail.asi1_llm_integration.details}
              />
              <FeatureCard
                title="Payment protocol"
                implemented={detail.payment_protocol.implemented}
                details={detail.payment_protocol.details}
              />
            </div>
          </div>

          {(detail.protocol_validation || detail.benchmark) && (
            <div className="grid gap-3 md:grid-cols-2">
              {detail.protocol_validation && (
                <div className="rounded-lg border border-gh-border bg-gh-card p-4 text-sm">
                  <div className="text-xs uppercase tracking-wide text-gh-muted">
                    Protocol validation (heuristic)
                  </div>
                  <div className="mt-2 text-gray-100">
                    Payment:{" "}
                    <span className="text-gh-accent">{detail.protocol_validation.payment}</span>
                  </div>
                  <div className="mt-1 text-gray-100">
                    Chat: <span className="text-gh-accent">{detail.protocol_validation.chat}</span>
                  </div>
                  {(detail.protocol_validation.payment_notes || []).length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-xs text-gh-muted">
                      {detail.protocol_validation.payment_notes!.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {detail.benchmark && (
                <div className="rounded-lg border border-gh-border bg-gh-card p-4 text-sm">
                  <div className="text-xs uppercase tracking-wide text-gh-muted">Benchmark</div>
                  <div className="mt-2 text-gray-100">
                    Closest: <span className="text-gh-accent">{detail.benchmark.closest_match}</span>
                    {" · "}
                    confidence {detail.benchmark.confidence}
                  </div>
                  {(detail.benchmark.similarity_good != null ||
                    detail.benchmark.similarity_bad != null) && (
                    <div className="mt-1 text-xs text-gh-muted">
                      sim_good {detail.benchmark.similarity_good ?? "—"} · sim_bad{" "}
                      {detail.benchmark.similarity_bad ?? "—"}
                    </div>
                  )}
                  {detail.benchmark.reason && (
                    <p className="mt-2 text-xs leading-relaxed text-gh-muted">
                      {detail.benchmark.reason}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {detail.scores && Object.keys(detail.scores).length > 0 && (
            <div className="rounded-lg border border-gh-border bg-gh-card p-4">
              <div className="text-xs uppercase tracking-wide text-gh-muted">Axis scores (0–10)</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                {Object.entries(detail.scores).map(([k, v]) => (
                  <div key={k} className="rounded border border-gh-border bg-[#010409] px-2 py-2 text-center">
                    <div className="text-[10px] capitalize text-gh-muted">{k.replace(/_/g, " ")}</div>
                    <div className="text-lg font-semibold text-gh-accent">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(detail.problem_solved || detail.solution_overview) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {detail.problem_solved ? (
                <SummaryPanel title="Problem this repo targets" body={detail.problem_solved} />
              ) : null}
              {detail.solution_overview ? (
                <SummaryPanel title="How it solves it" body={detail.solution_overview} />
              ) : null}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <IssuesList items={detail.issues || []} />
            <div className="space-y-4">
              <SummaryPanel title="Summary" body={detail.summary || "—"} />
              <SummaryPanel title="Notes" body={detail.notes || "—"} />
            </div>
          </div>
        </div>
      )}
    </div>
      <SiteFooter />
    </div>
  );
}
