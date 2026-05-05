"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertCircle, Github, Loader2, Sparkles } from "lucide-react";
import { evaluateRepo } from "@/lib/api";
import { ingestSingleResult } from "@/lib/stats-storage";
import { useEvaluation } from "@/context/EvaluationContext";
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

export default function EvaluatePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { setSingle } = useEvaluation();

  const githubLogin = (session?.user?.githubLogin || "").toLowerCase();
  const avatar = session?.user?.image;

  const [url, setUrl] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [ctx, setCtx] = React.useState("");
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
      setUrlErr("Enter your GitHub repository URL.");
      return null;
    }
    const parsed = parseOwnerRepo(url);
    if (!parsed) {
      setUrlErr("URL should look like https://github.com/<owner>/<repo>");
      return null;
    }
    if (githubLogin && parsed.owner.toLowerCase() !== githubLogin) {
      setUrlErr(
        `You can only analyse repos owned by ${session?.user?.githubLogin}. Forks count as your own — push them to your account first.`,
      );
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
      const ev = await evaluateRepo(
        url,
        {
          branch: branch || undefined,
          submission_context: ctx.trim() || undefined,
          submission_metadata: {
            owner: parsed.owner,
            repo: parsed.repo,
            github_login: session?.user?.githubLogin,
          },
          user_github_login: session?.user?.githubLogin,
          create_github_issue: true,
        },
        abortRef.current.signal,
      );
      ingestSingleResult(ev);
      setSingle(ev);
      const issueUrl = ev.github_issue_url || ev.github_issue?.issue_url || ev.report_v2?.github_issue_url;
      if (issueUrl) {
        toast.success("Analysis complete. GitHub issue opened.");
      } else {
        toast.success("Analysis complete.");
      }
      router.push(ev.submission_id ? `/results/${ev.submission_id}` : "/results");
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
          Fetch.ai · single-repo deep analysis
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-gh-text">
          Analyse your repository
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-gh-muted">
          We&apos;ll deeply review your code for uAgents protocol use, ChatProtocol, payment
          protocol, ASI:1 LLM integration, and architecture quality — then auto-create a
          GitHub issue with concrete patches and links to the right docs.
        </p>
      </header>

      <Card className="overflow-hidden border-gh-border bg-gh-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-9 w-9 rounded-md" />
            ) : (
              <Github className="h-5 w-5 text-gh-text" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              {status === "loading"
                ? "Loading account…"
                : `Signed in as ${session?.user?.githubLogin || session?.user?.name || "github user"}`}
            </CardTitle>
            <CardDescription>
              You can only analyse repositories owned by your GitHub account.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="repo-url">Repository URL</Label>
            <Input
              id="repo-url"
              className="mt-1 font-mono text-sm"
              placeholder={
                githubLogin ? `https://github.com/${githubLogin}/your-repo` : "https://github.com/<you>/<repo>"
              }
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlErr(null);
              }}
              disabled={loading}
              aria-invalid={!!urlErr}
              aria-describedby={urlErr ? "url-err" : undefined}
            />
            {urlErr && (
              <p id="url-err" role="alert" className="mt-1 flex items-center gap-1 text-xs text-fetchai-pink">
                <AlertCircle className="h-3.5 w-3.5" /> {urlErr}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="branch">Branch (optional)</Label>
            <Input
              id="branch"
              className="mt-1 font-mono text-sm"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="ctx">Submission notes (optional)</Label>
            <textarea
              id="ctx"
              maxLength={4000}
              disabled={loading}
              className="mt-1 min-h-[100px] w-full rounded-md border border-gh-border bg-gh-bg/60 px-3 py-2 font-mono text-sm text-gh-text placeholder:text-gh-subtle focus:outline-none focus:ring-2 focus:ring-fetchai-purple"
              placeholder="What does your project do? Any judging notes, hackathon track, key flows…"
              value={ctx}
              onChange={(e) => setCtx(e.target.value)}
            />
            <p className="mt-1 font-mono text-[11px] text-gh-muted">{ctx.length}/4000</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="lg"
          onClick={run}
          disabled={loading || status !== "authenticated" || !url.trim()}
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
