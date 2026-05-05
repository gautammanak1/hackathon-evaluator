import { adminProxy } from "@/lib/admin-server";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  return adminProxy("/admin/stats");
}
