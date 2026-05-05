"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { LiveTerminal } from "@/components/dashboard/LiveTerminal";

const GITHUB_REPO_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i;

function parseOwnerRepo(url: string): { owner: string; repo: string } | null {
  const m = GITHUB_REPO_RE.exec(url.trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

type EvalApiResponse = {
  evaluation: {
    submission_id?: string;
    github_issue_url?: string | null;
    github_issue?: { issue_url?: string | null };
  };
  submission_id?: string;
};

export default function AdminAnalyzePage() {
  const router = useRouter();

  const [url, setUrl] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [ctx, setCtx] = React.useState("");
  const [createIssue, setCreateIssue] = React.useState(true);
  const [urlErr, setUrlErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [streamLines, setStreamLines] = React.useState<string[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!loading) return;
    const phases = [
      "[1/6] cloning repository…",
      "[2/6] indexing source tree…",
      "[3/6] retrieving fetch.ai docs (RAG)…",
      "[4/6] running deep code analysis…",
      "[5/6] generating remediation suggestions…",
      "[6/6] opening GitHub issue with findings…",
    ];
    let i = 0;
    setStreamLines([phases[0]]);
    const t = setInterval(() => {
      i = Math.min(i + 1, phases.length - 1);
      setStreamLines((prev) => (prev.includes(phases[i]) ? prev : [...prev, phases[i]]));
    }, 8000);
    return () => clearInterval(t);
  }, [loading]);

  function validate(): { owner: string; repo: string } | null {
    if (!url.trim()) {
      setUrlErr("Enter a GitHub repository URL.");
      return null;
    }
    const parsed = parseOwnerRepo(url);
    if (!parsed) {
      setUrlErr("URL should look like https://github.com/<owner>/<repo>");
      return null;
    }
    setUrlErr(null);
    return parsed;
  }

  async function run() {
    const parsed = validate();
    if (!parsed) return;
    setLoading(true);
    setStreamLines([]);
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/admin/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: url.trim(),
          branch: branch.trim() || undefined,
          submission_context: ctx.trim() || undefined,
          submission_metadata: {
            owner: parsed.owner,
            repo: parsed.repo,
            initiated_by: "admin",
          },
          create_github_issue: createIssue,
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as EvalApiResponse;
      const submissionId = data.submission_id || data.evaluation?.submission_id;
      const issueUrl = data.evaluation?.github_issue_url || data.evaluation?.github_issue?.issue_url;
      if (issueUrl) {
        toast.success("Analysis complete. GitHub issue opened.");
      } else {
        toast.success("Analysis complete.");
      }
      if (submissionId) {
        router.push(`/results/${submissionId}`);
      } else {
        router.push("/admin");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.error("Cancelled");
      } else {
        toast.error((e as Error).message || "Analysis failed");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gh-muted">
          Admin · single-repo deep analysis
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-gh-text">
          Run analysis on any repository
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-gh-muted">
          Admins are exempt from the &quot;analyse only your own repo&quot; rule. Paste any
          public GitHub repo URL — we&apos;ll deep-review it and (optionally) auto-open a
          findings issue against that repo using the server-side
          <code className="mx-1 rounded bg-fetch-soft px-1 py-0.5 text-[#5F38FB]">GITHUB_TOKEN</code>
          fallback.
        </p>
      </header>

      <Card className="overflow-hidden border-gh-border bg-white">
        <CardHeader>
          <CardTitle className="text-base">Repository</CardTitle>
          <CardDescription>Any GitHub repo — no ownership check applies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="admin-repo-url">Repository URL</Label>
            <Input
              id="admin-repo-url"
              className="mt-1 font-mono text-sm"
              placeholder="https://github.com/<owner>/<repo>"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlErr(null);
              }}
              disabled={loading}
              aria-invalid={!!urlErr}
              aria-describedby={urlErr ? "admin-url-err" : undefined}
            />
            {urlErr && (
              <p id="admin-url-err" role="alert" className="mt-1 flex items-center gap-1 text-xs text-[#cf447b]">
                <AlertCircle className="h-3.5 w-3.5" /> {urlErr}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="admin-branch">Branch (optional)</Label>
            <Input
              id="admin-branch"
              className="mt-1 font-mono text-sm"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="admin-ctx">Notes (optional)</Label>
            <textarea
              id="admin-ctx"
              maxLength={4000}
              disabled={loading}
              className="mt-1 min-h-[100px] w-full rounded-md border border-gh-border bg-white px-3 py-2 font-mono text-sm text-gh-text placeholder:text-gh-subtle focus:outline-none focus:ring-2 focus:ring-[#5F38FB]"
              placeholder="Hackathon track, judging notes, anything you want to record on the run."
              value={ctx}
              onChange={(e) => setCtx(e.target.value)}
            />
            <p className="mt-1 font-mono text-[11px] text-gh-muted">{ctx.length}/4000</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gh-text">
            <input
              type="checkbox"
              checked={createIssue}
              onChange={(e) => setCreateIssue(e.target.checked)}
              disabled={loading}
              className="h-4 w-4 accent-[#5F38FB]"
            />
            Auto-create GitHub issue with findings
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="lg"
          onClick={run}
          disabled={loading || !url.trim()}
          className="gap-2 bg-[#5F38FB] text-white hover:bg-[#7A58FF]"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analysing…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Run deep analysis
            </>
          )}
        </Button>
        {loading && (
          <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        )}
        <span className="font-mono text-[11px] text-gh-muted">Typical run: 30–120s.</span>
      </div>

      {loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <Progress value={Math.min(95, streamLines.length * 14 + 10)} />
          <LiveTerminal lines={streamLines} />
        </motion.div>
      )}
    </div>
  );
}
