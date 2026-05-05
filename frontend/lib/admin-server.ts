import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminCookieName, verifyAdminToken } from "@/lib/admin-auth";

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export type AdminContext = { token: string };

export function getAdminContext(): AdminContext | null {
  const token = cookies().get(adminCookieName())?.value;
  if (!token) return null;
  if (!verifyAdminToken(token)) return null;
  return { token };
}

export async function adminProxy(
  path: string,
  init?: { method?: string; body?: BodyInit | null; headers?: HeadersInit },
): Promise<Response> {
  const ctx = getAdminContext();
  if (!ctx) {
    return NextResponse.json({ error: "admin auth required" }, { status: 401 });
  }
  const url = `${BACKEND_URL.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("X-Admin-Token", ctx.token);
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    body: init?.body,
    headers,
    cache: "no-store",
  });
  // Return as-is; downstream Next route can re-wrap if it wants typed JSON.
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/json",
    },
  });
}
