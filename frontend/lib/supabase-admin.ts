import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service-role key. Bypasses RLS.
 * Never import this from client components. Returns null when env vars are
 * missing so dev environments without Supabase configured still boot.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

export type DbUser = {
  id: string;
  github_id: number;
  github_login: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_login_at: string | null;
};

export async function upsertGithubUser(profile: {
  githubId: number;
  githubLogin: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}): Promise<DbUser | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("users")
    .upsert(
      {
        github_id: profile.githubId,
        github_login: profile.githubLogin,
        email: profile.email ?? null,
        name: profile.name ?? null,
        avatar_url: profile.avatarUrl ?? null,
        last_login_at: now,
      },
      { onConflict: "github_id" },
    )
    .select("id, github_id, github_login, email, name, avatar_url, created_at, last_login_at")
    .single();
  if (error) {
    console.error("[supabase] upsertGithubUser failed", error);
    return null;
  }
  return data as DbUser;
}
