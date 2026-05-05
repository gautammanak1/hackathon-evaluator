# Supabase migrations

This folder ships the SQL the Hackathon Evaluator needs in your Supabase
project. The application talks to Supabase with the **service-role key**
from the FastAPI backend, so RLS is mostly defensive.

## How to run

1. Open your Supabase project → SQL Editor.
2. Paste each file below in order and run it:
   1. `0001_init.sql` — creates `users`, `evaluations`, `admin_audit`.
   2. `0002_rls.sql` — enables row level security for users that ever
      hit PostgREST with a Supabase JWT.
3. Grab the connection details from **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` (server only,
     never expose to the browser).
4. Paste those into the project root `.env` (see `.env.example`).

## Schema

- `users` — one row per GitHub login. Created on first NextAuth sign-in.
- `evaluations` — one row per evaluation run. The full report is kept in
  `payload` (jsonb), and a few hot fields (`score`, `classification`,
  `repo_owner`, `repo_name`, `github_issue_url`) are denormalised for the
  admin dashboard.
- `admin_audit` — append-only log of admin-side actions.
