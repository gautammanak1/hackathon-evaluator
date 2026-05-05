import { NextResponse, type NextRequest } from "next/server";
import { adminCookieName, adminTokenTtl, issueAdminToken, verifyCredentials } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "missing_credentials" }, { status: 400 });
  }

  if (!verifyCredentials(email, password)) {
    // Constant-ish delay to make brute force less attractive
    await new Promise((r) => setTimeout(r, 350));
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const token = issueAdminToken(email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: adminTokenTtl(),
    path: "/",
  });
  return res;
}
