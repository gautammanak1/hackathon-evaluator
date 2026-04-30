"use client";

import * as React from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const STORAGE_API_KEY = "he:api_key";
const STORAGE_API_URL = "he:api_url_override";
const STORAGE_EXPORT = "he:export_format";
const STORAGE_MONO = "he:mono_font";

export default function SettingsPage() {
  const [apiKey, setApiKey] = React.useState("");
  const [apiUrl, setApiUrl] = React.useState(API_BASE);
  const [exportFmt, setExportFmt] = React.useState<"csv" | "json">("json");
  const [mono, setMono] = React.useState(false);
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [testMsg, setTestMsg] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    try {
      setApiKey(localStorage.getItem(STORAGE_API_KEY) || "");
      setApiUrl(localStorage.getItem(STORAGE_API_URL) || API_BASE);
      const ex = localStorage.getItem(STORAGE_EXPORT);
      if (ex === "csv" || ex === "json") setExportFmt(ex);
      setMono(localStorage.getItem(STORAGE_MONO) === "1");
      setTheme((localStorage.getItem("he:theme") as "light" | "dark") || "light");
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("he:theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  React.useEffect(() => {
    document.documentElement.classList.toggle("font-mono-all", mono);
    try {
      localStorage.setItem(STORAGE_MONO, mono ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [mono]);

  async function testConnection() {
    setTesting(true);
    setTestMsg(null);
    try {
      localStorage.setItem(STORAGE_API_KEY, apiKey);
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

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_EXPORT, exportFmt);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-[600px] space-y-8 py-2">
      <div>
        <h1 className="text-2xl font-bold text-black">Settings</h1>
        <p className="font-mono text-xs text-[#808080]">API preferences are stored in this browser only.</p>
      </div>

      <Card className="rounded-none border-[#808080]">
        <CardHeader>
          <CardTitle className="text-lg">API Settings</CardTitle>
          <CardDescription>Optional client-side overrides for documentation / tooling.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              className="mt-1 border-[#808080] bg-white font-mono text-sm"
              placeholder="Optional — backend uses server env in production"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => {
                try {
                  localStorage.setItem(STORAGE_API_KEY, apiKey);
                } catch {
                  /* ignore */
                }
              }}
            />
          </div>
          <div>
            <Label htmlFor="api-url">API Endpoint</Label>
            <Input
              id="api-url"
              className="mt-1 border-[#808080] bg-white font-mono text-sm"
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
            <Button type="button" variant="outline" className="border-black" onClick={testConnection} disabled={testing}>
              {testing ? (
                <span className="font-mono">
                  Testing<span className="terminal-dots inline-block w-8 pl-1" aria-hidden />
                </span>
              ) : (
                "Test connection"
              )}
            </Button>
            {testMsg && <span className="font-mono text-sm underline text-black">{testMsg}</span>}
          </div>
          <Link href="/docs" className="inline-block font-mono text-sm underline">
            View documentation
          </Link>
        </CardContent>
      </Card>

      <Card className="rounded-none border-[#808080]">
        <CardHeader>
          <CardTitle className="text-lg">Display Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-black">Theme</legend>
            <label className="flex items-center gap-2 font-mono text-sm">
              <input type="radio" name="theme" checked={theme === "light"} onChange={() => setTheme("light")} />
              Light mode
            </label>
            <label className="flex items-center gap-2 font-mono text-sm">
              <input type="radio" name="theme" checked={theme === "dark"} onChange={() => setTheme("dark")} />
              Dark mode (grayscale)
            </label>
          </fieldset>
          <label className="flex items-center gap-2 font-mono text-sm">
            <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />
            Prefer monospace font site-wide
          </label>
          <div>
            <Label htmlFor="export-fmt">Export format</Label>
            <select
              id="export-fmt"
              className="mt-1 w-full border border-[#808080] bg-white px-3 py-2 font-mono text-sm"
              value={exportFmt}
              onChange={(e) => setExportFmt(e.target.value as "csv" | "json")}
              onBlur={savePrefs}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-none border-[#808080]">
        <CardHeader>
          <CardTitle className="text-lg">Documentation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-sm">
          <Link href="/docs" className="block underline">
            API Docs
          </Link>
          <Separator className="bg-[#808080]" />
          <details className="group rounded border border-[#808080] bg-white">
            <summary className="cursor-pointer border-b border-[#808080] bg-[#E8E8E8] px-3 py-2 font-sans text-sm font-medium text-black">
              FAQ — What is persisted?
            </summary>
            <div className="p-3 text-xs leading-relaxed text-[#404040]">
              Evaluations are stored on the API server (SQLite by default). This UI keeps recent labels in localStorage for convenience.
            </div>
          </details>
          <details className="group rounded border border-[#808080] bg-white">
            <summary className="cursor-pointer border-b border-[#808080] bg-[#E8E8E8] px-3 py-2 font-sans text-sm font-medium text-black">
              FAQ — Rate limits?
            </summary>
            <div className="p-3 text-xs leading-relaxed text-[#404040]">
              The frontend throttles evaluate calls to reduce accidental bursts; adjust in lib/api.ts if needed.
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
