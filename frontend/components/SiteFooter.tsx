"use client";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-gh-border bg-[#010409]/80">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <p className="text-sm font-semibold text-gray-100">Submission Intelligence</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-gh-muted">
              Automated scoring and narrative reports for agent-hackathon repositories—grounded on your
              policies and documentation, not generic web search.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gh-muted">Capabilities</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              <li>Single repo, PDF, or bulk CSV / Excel</li>
              <li>Structured scores, protocol heuristics, LLM rationale</li>
              <li>JSON export for your own leaderboards and tooling</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gh-muted">Governance</p>
            <p className="mt-3 text-sm leading-relaxed text-gh-muted">
              Outputs are <span className="text-gray-400">assistive only</span>. Protocol validation is
              static analysis, not a runtime security audit. Final ranking and prizes remain with event
              organizers. Configure the API and data you send in line with your privacy and AI policies.
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-gh-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gh-muted">
            Built for <span className="text-gray-400">Fetch.ai</span> / ASI:One-style hackathon reviews.
            Not affiliated with GitHub or OpenAI.
          </p>
          <p className="text-xs text-gh-muted tabular-nums">© {new Date().getFullYear()}</p>
        </div>
      </div>
    </footer>
  );
}
