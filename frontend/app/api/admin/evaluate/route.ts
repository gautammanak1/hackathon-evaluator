import { NextResponse } from "next/server";
import { adminProxy, getAdminContext } from "@/lib/admin-server";

export async function POST(req: Request) {
  // Admin must be signed in. The X-Admin-Token sent to FastAPI tells the
  // backend's `_enforce_repo_ownership` to skip the "you can only analyse
  // your own repo" check, so admins can run analysis on any GitHub repo.
  const ctx = getAdminContext();
  if (!ctx) {
    return NextResponse.json({ error: "admin auth required" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const forwarded: Record<string, unknown> = {
    ...body,
    create_github_issue: body.create_github_issue ?? true,
  };

  return adminProxy("/evaluate", {
    method: "POST",
    body: JSON.stringify(forwarded),
    headers: { "Content-Type": "application/json" },
  });
}
