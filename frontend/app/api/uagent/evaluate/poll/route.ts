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

  let body: { job_id?: string } = {};
  try {
    body = (await req.json()) as { job_id?: string };
  } catch {
    body = {};
  }

  const upstream = await fetch(`${uagentBase()}/evaluate/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: String(body.job_id ?? "").trim() }),
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
