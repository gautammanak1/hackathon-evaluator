import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function POST(req: Request) {
  // Pull the user's GitHub OAuth token off the encrypted NextAuth JWT — it never
  // touches the browser. The `repo` scope on that token is what lets the backend
  // open the evaluation issue against the user's repo on their behalf, so we no
  // longer need a separate GitHub App installation.
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

  const forwarded: Record<string, unknown> = {
    ...body,
    create_github_issue: body.create_github_issue ?? true,
  };
  if (accessToken && !forwarded.github_token) forwarded.github_token = accessToken;
  if (githubLogin && !forwarded.user_github_login) forwarded.user_github_login = githubLogin;

  const upstream = await fetch(`${BACKEND_URL}/evaluate`, {
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
