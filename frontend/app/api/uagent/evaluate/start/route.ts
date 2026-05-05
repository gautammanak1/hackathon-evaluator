import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

function uagentBase(): string {
  const raw =
    process.env.UAGENT_HTTP_BASE?.trim() ||
    process.env.NEXT_PUBLIC_UAGENT_HTTP?.trim() ||
    "http://127.0.0.1:9100";
  return raw.replace(/\/+$/, "");
}

export async function POST(req: Request) {
  const token = await getToken({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: req as any,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const accessToken = (token as { accessToken?: string }).accessToken;
  const githubLogin = (token as { githubLogin?: string }).githubLogin;

  const createIssue = body.create_github_issue;
  const wantsIssue =
    createIssue === undefined || createIssue === true || createIssue === "true" || createIssue === 1;

  const metaRaw = body.submission_metadata_json;
  let submissionMetadataJson = "";
  if (typeof metaRaw === "string") {
    submissionMetadataJson = metaRaw.trim();
  } else if (metaRaw && typeof metaRaw === "object") {
    try {
      submissionMetadataJson = JSON.stringify(metaRaw);
    } catch {
      submissionMetadataJson = "";
    }
  }

  const forwarded: Record<string, unknown> = {
    repo_url: String(body.repo_url ?? "").trim(),
    branch: String(body.branch ?? "").trim(),
    submission_context: String(body.submission_context ?? "").trim(),
    submission_metadata_json: submissionMetadataJson,
    create_github_issue: wantsIssue ? "true" : "false",
    github_token: String(body.github_token ?? accessToken ?? "").trim(),
    user_github_login: String(body.user_github_login ?? githubLogin ?? "").trim(),
  };

  const upstream = await fetch(`${uagentBase()}/evaluate/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(forwarded),
    cache: "no-store",
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
