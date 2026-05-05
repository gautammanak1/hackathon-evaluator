"use client";

import * as React from "react";
import toast from "react-hot-toast";
import { FileUp, Loader2, Upload } from "lucide-react";
import { evaluateBatchUpload, evaluateSubmission } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminBulkPage() {
  const [csv, setCsv] = React.useState<File | null>(null);
  const [pdf, setPdf] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string>("");

  async function runCsv() {
    if (!csv) return;
    setBusy(true);
    setResult("");
    try {
      const out = await evaluateBatchUpload(csv);
      setResult(`Processed ${out.count} rows. See /admin for individual results.`);
      toast.success(`Bulk processed ${out.count} rows.`);
    } catch (e) {
      toast.error((e as Error).message || "Bulk failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPdf() {
    if (!pdf) return;
    setBusy(true);
    setResult("");
    try {
      const fd = new FormData();
      fd.append("pdf", pdf);
      const out = await evaluateSubmission(fd);
      const count = out.mode === "batch" ? out.count : 1;
      setResult(`Processed ${count} repo${count === 1 ? "" : "s"} from PDF.`);
      toast.success(`Processed ${count}.`);
    } catch (e) {
      toast.error((e as Error).message || "PDF processing failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gh-muted">Admin · Bulk tools</p>
        <h1 className="text-3xl font-semibold tracking-tight">Multi-repo evaluations</h1>
        <p className="text-sm text-gh-muted">CSV, Excel and PDF intake — admin-only.</p>
      </header>

      <Tabs defaultValue="csv" className="w-full">
        <TabsList className="bg-gh-card/60">
          <TabsTrigger value="csv">CSV / Excel</TabsTrigger>
          <TabsTrigger value="pdf">PDF</TabsTrigger>
        </TabsList>

        <TabsContent value="csv">
          <Card className="border-gh-border bg-gh-card/60">
            <CardHeader>
              <CardTitle>CSV / Excel batch</CardTitle>
              <CardDescription>
                Required column: repo_url, url, repository, or repo. One repo per row.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => setCsv(e.target.files?.[0] ?? null)}
                className="block text-sm text-gh-muted file:mr-3 file:rounded-md file:border file:border-gh-border file:bg-gh-card file:px-3 file:py-2 file:text-sm file:text-gh-text hover:file:bg-fetch-soft"
              />
              {csv && (
                <p className="font-mono text-xs text-gh-muted">
                  {csv.name} ({Math.round(csv.size / 1024)} KB)
                </p>
              )}
              <Button
                onClick={runCsv}
                disabled={!csv || busy}
                className="gap-2 bg-[#5F38FB] text-white hover:bg-[#7A58FF]"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Run batch
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf">
          <Card className="border-gh-border bg-gh-card/60">
            <CardHeader>
              <CardTitle>PDF intake</CardTitle>
              <CardDescription>Upload a hackathon submissions PDF; we extract GitHub URLs and evaluate each.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                className="block text-sm text-gh-muted file:mr-3 file:rounded-md file:border file:border-gh-border file:bg-gh-card file:px-3 file:py-2 file:text-sm file:text-gh-text hover:file:bg-fetch-soft"
              />
              {pdf && (
                <p className="font-mono text-xs text-gh-muted">
                  {pdf.name} ({Math.round(pdf.size / 1024)} KB)
                </p>
              )}
              <Button
                onClick={runPdf}
                disabled={!pdf || busy}
                className="gap-2 bg-[#5F38FB] text-white hover:bg-[#7A58FF]"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Process PDF
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {result && (
        <p className="rounded-md border border-fetchai-purple/40 bg-fetchai-purple/10 px-3 py-2 text-sm text-gh-text">
          {result}
        </p>
      )}
    </div>
  );
}
