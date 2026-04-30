"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertCircle, ChevronDown, ChevronUp, FileUp, Github, Upload } from "lucide-react";
import { evaluateBatchUpload, evaluateRepo, evaluateSubmission } from "@/lib/api";
import { ingestBatchResults, ingestSingleResult } from "@/lib/stats-storage";
import { useEvaluation } from "@/context/EvaluationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EvaluationTimeline, PIPELINE_STEPS, PipelineFlowStrip, usePipelineTicker } from "@/components/evaluation/EvaluationTimeline";
import { TerminalChrome } from "@/components/evaluation/TerminalChrome";
import {
  type EvaluateProtocolPrefill,
  EVALUATE_PREFILL_QUERY,
  EVALUATE_PROTOCOL_PREFILL_KEY,
} from "@/lib/evaluate-prefill";

function EvaluateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const defaultTab = tabParam === "pdf" ? "pdf" : tabParam === "bulk" ? "bulk" : "repo";

  const { setSingle, setBatch } = useEvaluation();

  const [tab, setTab] = React.useState(defaultTab);
  React.useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const [url, setUrl] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [bulkFile, setBulkFile] = React.useState<File | null>(null);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  const bulkInputRef = React.useRef<HTMLInputElement>(null);

  const [ctx, setCtx] = React.useState("");
  const [team, setTeam] = React.useState("");
  const [tableName, setTableName] = React.useState("");
  const [track, setTrack] = React.useState("");
  const [ragNote, setRagNote] = React.useState(false);
  const [benchNote, setBenchNote] = React.useState(false);
  const [advOpen, setAdvOpen] = React.useState(false);

  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const activeStep = usePipelineTicker(loading, done);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [previewRows, setPreviewRows] = React.useState<string[][]>([]);

  const [urlErr, setUrlErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const from = params.get("from");
    if (from !== EVALUATE_PREFILL_QUERY && from !== "protocol-chat") return;
    const raw = sessionStorage.getItem(EVALUATE_PROTOCOL_PREFILL_KEY);
    if (!raw) {
      router.replace("/evaluate?tab=repo");
      return;
    }
    sessionStorage.removeItem(EVALUATE_PROTOCOL_PREFILL_KEY);
    try {
      const data = JSON.parse(raw) as EvaluateProtocolPrefill;
      setTab("repo");
      if (data.repoUrl) setUrl(data.repoUrl);
      if (data.branch?.trim()) setBranch(data.branch.trim());
      if (data.submission_context?.trim()) {
        setCtx(data.submission_context.trim());
        setAdvOpen(true);
      }
      const f = data.focus;
      toast.success(
        f === "payment"
          ? "Loaded repo + payment protocol notes — check Advanced → Custom submission context."
          : f === "llm"
            ? "Loaded repo + LLM notes — check Advanced → Custom submission context."
            : f === "uagents"
              ? "Loaded repo + uAgents notes — check Advanced → Custom submission context."
              : "Loaded repo + chat protocol notes — check Advanced → Custom submission context.",
      );
      router.replace("/evaluate?tab=repo");
    } catch {
      toast.error("Could not apply prefilled evaluate data.");
      router.replace("/evaluate?tab=repo");
    }
  }, [params, router]);

  function clearPdf() {
    setPdfFile(null);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }
  function clearBulk() {
    setBulkFile(null);
    if (bulkInputRef.current) bulkInputRef.current.value = "";
    setPreviewRows([]);
  }

  function onUrlChange(v: string) {
    setUrl(v);
    setUrlErr(null);
    if (v.trim()) {
      clearPdf();
      clearBulk();
    }
  }

  function buildMetadata(): Record<string, unknown> | undefined {
    const m: Record<string, unknown> = {};
    if (team.trim()) m.team_name = team.trim();
    if (tableName.trim()) m.table_name = tableName.trim();
    if (track.trim()) m.track = track.trim();
    if (ragNote || benchNote) {
      m.ui_preferences = { rag_grounding_requested: ragNote, benchmark_compare_requested: benchNote };
    }
    if (Object.keys(m).length === 0) return undefined;
    return m;
  }

  function buildContextExtra(): string {
    const parts: string[] = [];
    if (ctx.trim()) parts.push(ctx.trim());
    if (ragNote) parts.push("[Judge note: prioritize documentation-grounded knowledge where configured.]");
    if (benchNote) parts.push("[Judge note: emphasize benchmark / similarity signals when present.]");
    return parts.join("\n\n");
  }

  function validateRepo(): boolean {
    if (!url.trim()) {
      setUrlErr("Enter a GitHub repository URL.");
      return false;
    }
    if (!url.includes("github.com") && !url.startsWith("git@")) {
      setUrlErr("URL should point to github.com (or git@github.com).");
      return false;
    }
    setUrlErr(null);
    return true;
  }

  async function runEvaluation() {
    setDone(false);
    setLoading(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const meta = buildMetadata();
    const submission_context = buildContextExtra() || undefined;

    try {
      if (ctx.trim().length > 8000) {
        toast.error("Custom context must be at most 8000 characters.");
        setLoading(false);
        return;
      }
      if (tab === "repo") {
        if (!validateRepo()) {
          setLoading(false);
          return;
        }
        const ev = await evaluateRepo(
          url,
          { branch: branch || undefined, submission_context, submission_metadata: meta },
          signal,
        );
        ingestSingleResult(ev);
        setSingle(ev);
        toast.success("Evaluation complete");
        router.push(ev.submission_id ? `/results/${ev.submission_id}` : "/results");
      } else if (tab === "pdf") {
        if (!pdfFile) {
          toast.error("Choose a PDF file");
          setLoading(false);
          return;
        }
        const fd = new FormData();
        fd.append("pdf", pdfFile);
        const out = await evaluateSubmission(fd, signal);
        if (out.mode === "batch") {
          ingestBatchResults(out.results);
          setBatch(out.results, out.notice);
          toast.success(`Batch: ${out.count} repos`);
          router.push("/leaderboard");
        } else {
          const merged = {
            ...out.evaluation,
            submission_id: out.submission_id ?? out.evaluation.submission_id,
          };
          ingestSingleResult(merged);
          setSingle(merged);
          toast.success("Evaluation complete");
          router.push(merged.submission_id ? `/results/${merged.submission_id}` : "/results");
        }
      } else {
        if (!bulkFile) {
          toast.error("Choose a CSV or Excel file");
          setLoading(false);
          return;
        }
        const out = await evaluateBatchUpload(bulkFile, signal);
        ingestBatchResults(out.results);
        setBatch(out.results, null);
        toast.success(`Evaluated ${out.count} rows`);
        router.push("/leaderboard");
      }
      setDone(true);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.error("Cancelled");
      } else {
        toast.error((e as Error).message || "Request failed");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function onPdfPick(f: File | null) {
    if (f) {
      setUrl("");
      clearBulk();
    } else {
      clearPdf();
    }
    setPdfFile(f);
  }

  function onBulkPick(f: File | null) {
    if (f) {
      setUrl("");
      clearPdf();
      if (f.name.endsWith(".csv") || f.type.includes("csv")) {
        Papa.parse(f, {
          header: false,
          preview: 9,
          complete: (res) => setPreviewRows((res.data as string[][]).slice(0, 8)),
        });
      } else {
        setPreviewRows([["Preview available after upload for .csv in browser — .xlsx parsed on server."]]);
      }
    }
    setBulkFile(f);
  }

  function onDropPdf(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f?.type === "application/pdf" || f.name.endsWith(".pdf")) onPdfPick(f);
    else toast.error("Drop a PDF file");
  }

  function onDropBulk(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onBulkPick(f);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gh-text">Run evaluation</h1>
        <p className="mt-1 text-sm text-gh-muted">
          Pick one path (repo URL, PDF with repo links, or CSV/XLSX batch).{" "}
          <strong className="font-medium text-gh-text">Advanced options</strong> only affect{" "}
          <span className="font-mono text-xs">POST /evaluate</span>: optional judge metadata (
          <span className="font-mono text-[11px]">team_name</span>, etc.) and extra{" "}
          <span className="font-mono text-[11px]">submission_context</span> text passed with single-repo evaluation — used by prompts/RAG when configured on the server.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v)} className="w-full transition-opacity duration-150">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-none border-b border-gh-border bg-transparent p-0">
          <TabsTrigger
            value="repo"
            className="gap-2 rounded-none border-b-2 border-transparent pb-3 font-normal text-gh-muted data-[state=active]:border-gh-text data-[state=active]:text-gh-text dark:data-[state=active]:border-white dark:data-[state=active]:text-white"
          >
            <Github className="h-4 w-4 shrink-0" /> GitHub Repository
          </TabsTrigger>
          <TabsTrigger
            value="pdf"
            className="gap-2 rounded-none border-b-2 border-transparent pb-3 font-normal text-gh-muted data-[state=active]:border-gh-text data-[state=active]:text-gh-text dark:data-[state=active]:border-white dark:data-[state=active]:text-white"
          >
            <FileUp className="h-4 w-4 shrink-0" /> Upload PDF
          </TabsTrigger>
          <TabsTrigger
            value="bulk"
            className="gap-2 rounded-none border-b-2 border-transparent pb-3 font-normal text-gh-muted data-[state=active]:border-gh-text data-[state=active]:text-gh-text dark:data-[state=active]:border-white dark:data-[state=active]:text-white"
          >
            <Upload className="h-4 w-4 shrink-0" /> Bulk CSV Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="repo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>GitHub repository</CardTitle>
              <CardDescription>HTTPS or git@github.com clone URL.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="repo-url">Repository URL</Label>
                <Input
                  id="repo-url"
                  className="mt-1 font-mono text-sm"
                  placeholder="https://github.com/org/project"
                  value={url}
                  disabled={!!pdfFile || !!bulkFile}
                  onChange={(e) => onUrlChange(e.target.value)}
                  aria-invalid={!!urlErr}
                  aria-describedby={urlErr ? "url-err" : undefined}
                />
                {urlErr && (
                  <p id="url-err" className="mt-1 flex items-center gap-1 text-xs text-red-700 underline dark:text-red-400" role="alert">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {urlErr}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="branch">Branch (optional)</Label>
                <Input id="branch" className="mt-1 font-mono text-sm" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PDF upload</CardTitle>
              <CardDescription>Spreadsheet exports with multiple GitHub links may evaluate as a batch.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropPdf}
                className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#808080] bg-[#F8F8F8] p-6 transition-colors hover:border-black"
                onClick={() => pdfInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && pdfInputRef.current?.click()}
                aria-label="Upload PDF"
              >
                <FileUp className="mb-2 h-10 w-10 text-gh-muted" />
                <p className="text-sm text-gh-text">Drag & drop PDF or click to browse</p>
                <p className="mt-1 text-xs text-gh-muted">Max size limited by your reverse proxy / Render</p>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => onPdfPick(e.target.files?.[0] ?? null)}
                />
              </div>
              {pdfFile && (
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-mono text-gh-muted">{pdfFile.name}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => onPdfPick(null)}>
                    Remove
                  </Button>
                </div>
              )}
              {loading && tab === "pdf" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.35 }}
                  className="mt-4 space-y-2 overflow-hidden"
                >
                  <Progress value={Math.min(95, 25 + activeStep * 9)} className="transition-all duration-700 ease-out" />
                  <p className="font-mono text-[10px] text-gh-muted">Upload & routing… step {activeStep + 1}</p>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bulk CSV / Excel</CardTitle>
              <CardDescription>Required column: repo_url, url, repository, or repo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropBulk}
                className="flex min-h-[140px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-gh-border bg-gh-bg/50 p-6"
              >
                <Upload className="mb-2 h-8 w-8 text-gh-muted" />
                <Button type="button" variant="secondary" onClick={() => bulkInputRef.current?.click()}>
                  Select file
                </Button>
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => onBulkPick(e.target.files?.[0] ?? null)}
                />
              </div>
              {bulkFile && (
                <p className="text-sm font-mono text-gh-muted">
                  {bulkFile.name} ({Math.round(bulkFile.size / 1024)} KB)
                </p>
              )}
              {previewRows.length > 0 && (
                <ScrollArea className="h-[200px] rounded-md border border-gh-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {previewRows[0]?.map((_, j) => (
                          <TableHead key={j}>Col {j + 1}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, i) => (
                        <TableRow key={i}>
                          {row.map((cell, j) => (
                            <TableCell key={j} className="max-w-[160px] truncate font-mono text-xs">
                              {cell}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between p-5 text-left"
          onClick={() => setAdvOpen(!advOpen)}
          aria-expanded={advOpen}
        >
          <span className="text-sm font-medium text-gh-text">Advanced options</span>
          {advOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {advOpen && (
          <CardContent className="space-y-4 border-t border-gh-border pt-4">
            <div>
              <Label htmlFor="sub-ctx">Custom submission context</Label>
              <textarea
                id="sub-ctx"
                maxLength={8000}
                className="mt-1 min-h-[100px] w-full rounded-md border border-[#808080] bg-white px-3 py-2 font-mono text-sm text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                placeholder="Pitch, judging notes, rubric emphasis…"
                value={ctx}
                onChange={(e) => setCtx(e.target.value)}
              />
              <p className="mt-1 font-mono text-xs text-[#808080]">{ctx.length}/8000</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="team">team_name</Label>
                <Input id="team" className="mt-1" value={team} onChange={(e) => setTeam(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tbl">table_name</Label>
                <Input id="tbl" className="mt-1" value={tableName} onChange={(e) => setTableName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="trk">track</Label>
                <Input id="trk" className="mt-1" value={track} onChange={(e) => setTrack(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch id="rag" checked={ragNote} onCheckedChange={setRagNote} />
                <Label htmlFor="rag">RAG / docs emphasis (note to judge)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="bench" checked={benchNote} onCheckedChange={setBenchNote} />
                <Label htmlFor="bench">Benchmark emphasis (note to judge)</Label>
              </div>
            </div>
            <p className="text-xs text-gh-muted">
              Toggles add plain-text hints to <span className="font-mono">submission_context</span> for the single-repo JSON API. Server-side RAG still
              depends on your backend env configuration.
            </p>
          </CardContent>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="lg"
          onClick={() => setConfirmOpen(true)}
          disabled={
            loading ||
            (tab === "repo" && !url.trim()) ||
            (tab === "pdf" && !pdfFile) ||
            (tab === "bulk" && !bulkFile)
          }
        >
          {loading ? (
            <span className="flex items-center gap-2 font-mono">
              Processing<span className="terminal-dots inline-block min-w-[2ch]" aria-hidden />
            </span>
          ) : tab === "repo" ? (
            "Evaluate Repository"
          ) : tab === "pdf" ? (
            "Evaluate submission"
          ) : (
            "Preview & run bulk"
          )}
        </Button>
        {loading && (
          <Button type="button" variant="danger" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        )}
        <span className="text-xs text-gh-muted">Typical run: 15–90s depending on repo size.</span>
      </div>

      {loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-6 md:grid-cols-2"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pipeline</CardTitle>
              <CardDescription>Indicative steps while the API works (server does not stream progress).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <TerminalChrome title="pipeline.trace">
                <EvaluationTimeline activeStep={activeStep} loading={loading} />
                <PipelineFlowStrip activeStep={activeStep} embedded loading={loading} />
              </TerminalChrome>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gh-muted">
              <p>
                Step ~{activeStep + 1} of {PIPELINE_STEPS.length}
              </p>
              <Progress key={activeStep} value={((activeStep + 1) / PIPELINE_STEPS.length) * 100} className="transition-all duration-700" />
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent aria-describedby="confirm-desc">
          <DialogHeader>
            <DialogTitle>Start evaluation?</DialogTitle>
            <DialogDescription id="confirm-desc">
              This will call your configured API ({tab === "bulk" ? "batch upload" : tab === "pdf" ? "multipart submission" : "JSON evaluate"}).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Back
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void runEvaluation();
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function EvaluatePage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-4xl animate-pulse space-y-4 p-8">
          <div className="h-8 w-64 rounded bg-gh-border/40" />
          <div className="h-12 w-full rounded bg-gh-border/30" />
          <div className="h-72 rounded-lg bg-gh-border/20" />
        </div>
      }
    >
      <EvaluateForm />
    </React.Suspense>
  );
}
