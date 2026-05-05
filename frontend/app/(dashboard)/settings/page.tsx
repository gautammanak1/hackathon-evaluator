"use client";

import * as React from "react";
import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORAGE_API_URL = "he:api_url_override";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [apiUrl, setApiUrl] = React.useState(API_BASE);
  const [testMsg, setTestMsg] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    try {
      setApiUrl(localStorage.getItem(STORAGE_API_URL) || API_BASE);
    } catch {
      /* ignore */
    }
  }, []);

  async function testConnection() {
    setTesting(true);
    setTestMsg(null);
    try {
      localStorage.setItem(STORAGE_API_URL, apiUrl.trim() || API_BASE);
      const base = (apiUrl.trim() || API_BASE).replace(/\/$/, "");
      const r = await fetch(`${base}/health`, { cache: "no-store" });
      setTestMsg(r.ok ? "✓ Connected" : "✗ Connection failed");
    } catch {
      setTestMsg("✗ Connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[600px] space-y-8 py-2">
      <div>
        <h1 className="text-2xl font-bold text-gh-text">Settings</h1>
        <p className="font-mono text-xs text-gh-muted">Account &amp; backend connection.</p>
      </div>

      <Card className="border-gh-border bg-gh-card/60">
        <CardHeader>
          <CardTitle className="text-lg">Account</CardTitle>
          <CardDescription>Signed in via GitHub OAuth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row k="GitHub" v={session?.user?.githubLogin || "—"} />
          <Row k="Name" v={session?.user?.name || "—"} />
          <Row k="Email" v={session?.user?.email || "—"} />
          <Button
            type="button"
            variant="outline"
            className="mt-3 gap-2 border-fetchai-pink/50 text-fetchai-pink hover:bg-fetchai-pink/10"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>

      <Card className="border-gh-border bg-gh-card/60">
        <CardHeader>
          <CardTitle className="text-lg">Backend</CardTitle>
          <CardDescription>Test the FastAPI evaluator your browser is talking to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-url">API endpoint</Label>
            <Input
              id="api-url"
              className="mt-1 font-mono text-sm"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              onBlur={() => {
                try {
                  localStorage.setItem(STORAGE_API_URL, apiUrl.trim());
                } catch {
                  /* ignore */
                }
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={testConnection} disabled={testing}>
              {testing ? "Testing…" : "Test connection"}
            </Button>
            {testMsg && <span className="font-mono text-sm text-gh-text">{testMsg}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-gh-border bg-gh-bg/30 px-3 py-2">
      <span className="text-gh-muted">{k}</span>
      <span className="font-mono text-gh-text">{v}</span>
    </div>
  );
}
