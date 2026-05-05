"use client";

import { useState } from "react";
import { IssueCreator } from "@/components/github/IssueCreator";

export default function GithubIntegrationPage() {
  const [submissionId, setSubmissionId] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-white">GitHub Integration</h1>
      <input
        className="w-full rounded-md border border-white/15 bg-slate-900/50 px-3 py-2 text-sm text-white"
        placeholder="Submission ID"
        value={submissionId}
        onChange={(e) => setSubmissionId(e.target.value)}
      />
      <input
        className="w-full rounded-md border border-white/15 bg-slate-900/50 px-3 py-2 text-sm text-white"
        placeholder="Repository URL"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
      />
      {submissionId && repoUrl ? <IssueCreator submissionId={submissionId} repoUrl={repoUrl} /> : null}
    </div>
  );
}
