import { adminProxy } from "@/lib/admin-server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.search;
  return adminProxy(`/admin/users${search}`);
}
