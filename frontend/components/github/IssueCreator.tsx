"use client";

import { useState } from "react";
import { createGithubIssueForEvaluation } from "@/lib/api";
import { IssuePreview } from "./IssuePreview";
import { TokenInput } from "./TokenInput";

export function IssueCreator({ submissionId, repoUrl }: { submissionId: string; repoUrl: string }) {
  const [token, setToken] = useState("");
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = `# [Fetch.ai Evaluator] Code Analysis Report\n\nSubmission: ${submissionId}\nRepo: ${repoUrl}`;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold text-white">Create GitHub Issue</h3>
      <TokenInput value={token} onChange={setToken} />
      <IssuePreview markdown={preview} />
      <button
        className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
        disabled={!token || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const out = await createGithubIssueForEvaluation(submissionId, { repo_url: repoUrl, github_token: token });
            setIssueUrl(out.issue_url ?? null);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Creating..." : "Create Issue"}
      </button>
      {issueUrl ? (
        <a className="text-sm text-cyan-300 underline" href={issueUrl} target="_blank" rel="noreferrer">
          View on GitHub
        </a>
      ) : null}
    </div>
  );
}
