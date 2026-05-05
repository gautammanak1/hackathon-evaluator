import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ADMIN_COOKIE = "admin_session";

const PUBLIC_PATHS = new Set<string>([
  "/",
  "/admin/login",
  "/error",
]);

function isAdminApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/admin/") || pathname === "/api/admin";
}

function isAdminUiPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow NextAuth own endpoints
  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  // Admin login page + login/logout API are public so even an expired admin can clear their cookie.
  if (pathname === "/api/admin/login" || pathname === "/api/admin/logout") {
    return NextResponse.next();
  }

  // Admin gating
  if (isAdminUiPath(pathname) || isAdminApiPath(pathname)) {
    if (pathname === "/admin/login") return NextResponse.next();
    const adminCookie = request.cookies.get(ADMIN_COOKIE);
    if (!adminCookie || !adminCookie.value) {
      if (isAdminApiPath(pathname)) {
        return NextResponse.json({ error: "admin auth required" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Public marketing/auth paths
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // Everything else is "user dashboard" — require NextAuth session.
  // BUT: admins can also view evaluation result pages (/results/...) and the
  // proxy `/api/evaluate` so they can drill into runs from the admin console.
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const adminCookie = request.cookies.get(ADMIN_COOKIE);
  const adminAuthed = Boolean(adminCookie?.value);

  if (token) return NextResponse.next();
  if (adminAuthed && (pathname === "/results" || pathname.startsWith("/results/"))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Run middleware on every request except:
     * - _next/static, _next/image (build assets)
     * - favicon, public files (anything with a dot)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
