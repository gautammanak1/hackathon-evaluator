"use client";

import * as React from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <React.Suspense fallback={<LandingFallback />}>
      <LandingPageInner />
    </React.Suspense>
  );
}

function LandingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <Loader2 className="h-5 w-5 animate-spin text-[#5F38FB]" aria-hidden />
    </main>
  );
}

function LandingPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("from") || "/evaluate";
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  const handleSignIn = React.useCallback(() => {
    setBusy(true);
    signIn("github", { callbackUrl });
  }, [callbackUrl]);

  void session;

  return (
    <main className="relative min-h-screen overflow-hidden bg-white font-mono text-[#000D3E]">
      {/* Single, very subtle purple bloom in the upper-left so the page is
          not 100% flat. Everything else is plain white. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
        <div className="absolute -top-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-[#5F38FB] opacity-[0.08] blur-[160px]" />
      </div>

      <DashboardPaperPreview />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-[#000D3E]/10 px-6 py-5 sm:px-10">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-[#000D3E]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#5F38FB]" />
            Fetch.ai · Hackathon Evaluator
          </div>
          <a
            href="https://innovationlab.fetch.ai"
            target="_blank"
            rel="noreferrer"
            className="hidden text-xs uppercase tracking-[0.18em] text-[#000D3E]/60 hover:text-[#5F38FB] sm:inline"
          >
            innovationlab.fetch.ai
          </a>
        </header>

        <section className="flex flex-1 items-center justify-center px-4 pb-12">
          <div className="w-full max-w-md rounded-2xl border border-[#000D3E]/10 bg-white p-8 shadow-[0_20px_60px_rgba(0,13,62,0.08)]">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#000D3E]/10 bg-[#F7F8FB]">
                <Github className="h-5 w-5 text-[#000D3E]" aria-hidden />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C6489]">Sign in required</p>
                <h1 className="text-lg font-semibold text-[#000D3E]">Connect your GitHub</h1>
              </div>
            </div>

            <p className="mb-6 text-sm leading-relaxed text-[#5C6489]">
              Authenticate with GitHub to deeply analyse your Fetch.ai project.
              We&apos;ll review your repo, score it across protocol, agents,
              architecture and quality, and open a detailed issue with concrete
              fixes.
            </p>

            <Button
              type="button"
              size="lg"
              disabled={busy || status === "loading"}
              onClick={handleSignIn}
              className="w-full justify-center gap-2 rounded-xl bg-[#5F38FB] text-white hover:bg-[#7A58FF]"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Redirecting…
                </>
              ) : (
                <>
                  <Github className="h-5 w-5" aria-hidden />
                  Continue with GitHub
                </>
              )}
            </Button>

            <ul className="mt-6 space-y-2 text-xs text-[#5C6489]">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5F38FB]" aria-hidden />
                We only request <code className="text-[#000D3E]">read:user user:email repo</code> scope.
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5F38FB]" aria-hidden />
                You can only analyse repositories that you own.
              </li>
            </ul>
          </div>
        </section>

        <footer className="border-t border-[#000D3E]/10 px-6 py-5 text-[11px] uppercase tracking-[0.22em] text-[#5C6489] sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Built for the Fetch.ai ecosystem</span>
            <a href="/admin/login" className="hover:text-[#5F38FB]">Admin</a>
          </div>
        </footer>
      </div>
    </main>
  );
}

function DashboardPaperPreview() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center"
    >
      <div className="relative h-[120%] w-[120%] scale-[0.92] opacity-50 blur-[6px]">
        <div className="absolute left-[6%] top-[14%] h-[260px] w-[300px] rounded-2xl border border-[#000D3E]/10 bg-[#F7F8FB]" />
        <div className="absolute left-[6%] top-[58%] h-[220px] w-[300px] rounded-2xl border border-[#000D3E]/10 bg-[#F7F8FB]" />
        <div className="absolute right-[6%] top-[14%] h-[480px] w-[58%] rounded-2xl border border-[#000D3E]/10 bg-[#F7F8FB]" />
        <div className="absolute right-[6%] bottom-[8%] h-[140px] w-[58%] rounded-2xl border border-[#000D3E]/10 bg-[#F7F8FB]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/60 to-white" />
    </div>
  );
}
