"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-[#5F38FB]" aria-hidden />
        </main>
      }
    >
      <AdminLoginInner />
    </React.Suspense>
  );
}

function AdminLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const target = params.get("from") || "/admin";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error === "invalid_credentials" ? "Invalid email or password." : "Login failed.");
        return;
      }
      router.replace(target.startsWith("/admin") ? target : "/admin");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-white px-4 py-10 font-mono text-[#000D3E]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-[#5F38FB] opacity-[0.08] blur-[160px]" />
      </div>

      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-[#000D3E]/10 bg-white p-8 shadow-[0_20px_60px_rgba(0,13,62,0.08)]"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#000D3E]/10 bg-[#F7F8FB]">
            <ShieldCheck className="h-5 w-5 text-[#000D3E]" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C6489]">Restricted</p>
            <h1 className="text-lg font-semibold text-[#000D3E]">Admin sign in</h1>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-[#000D3E]">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 border-[#000D3E]/15 bg-white text-[#000D3E] placeholder:text-[#9099B5]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-[#000D3E]">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 border-[#000D3E]/15 bg-white text-[#000D3E] placeholder:text-[#9099B5]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>

          {err && (
            <p role="alert" className="text-sm text-[#cf447b]">
              {err}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full justify-center gap-2 bg-[#5F38FB] text-white hover:bg-[#7A58FF]"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> Sign in
              </>
            )}
          </Button>

          <p className="text-center text-[11px] uppercase tracking-[0.22em] text-[#5C6489]">
            Credentials live in the server .env
          </p>
        </div>
      </form>
    </main>
  );
}
