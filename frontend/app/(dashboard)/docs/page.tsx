import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-gh-text">Documentation</h1>
      <p className="text-sm text-gh-muted">
        API reference and repository:{" "}
        <Link href="https://github.com/gautammanak1/hackathon-evaluator" className="text-gh-blue hover:underline">
          github.com/gautammanak1/hackathon-evaluator
        </Link>
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs text-gh-muted">
          <p>
            <span className="text-gh-green">GET</span> /health
          </p>
          <p>
            <span className="text-gh-green">POST</span> /evaluate — JSON <code className="text-gh-text">repo_url</code>, optional{" "}
            <code className="text-gh-text">branch</code>, <code className="text-gh-text">submission_context</code>,{" "}
            <code className="text-gh-text">submission_metadata</code>
          </p>
          <p>
            <span className="text-gh-green">POST</span> /evaluate/submission — multipart PDF (+ optional fields per API)
          </p>
          <p>
            <span className="text-gh-green">POST</span> /evaluate/batch/upload — CSV or XLSX
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Bulk column names</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gh-muted">
          One of: <code className="font-mono text-gh-text">repo_url</code>, <code className="font-mono text-gh-text">url</code>,{" "}
          <code className="font-mono text-gh-text">repository</code>, <code className="font-mono text-gh-text">repo</code>. Other columns are echoed as{" "}
          <code className="font-mono text-gh-text">submission_metadata</code>.
        </CardContent>
      </Card>
    </div>
  );
}
