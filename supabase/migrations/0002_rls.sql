-- Hackathon Evaluator: row level security
-- Server (FastAPI + NextAuth /api routes) talks to Supabase with the
-- service-role key, which bypasses RLS. These policies exist so that
-- if you ever switch the frontend to talk directly to PostgREST with
-- a Supabase JWT (auth.uid()), users can only ever see their own rows.

alter table public.users       enable row level security;
alter table public.evaluations enable row level security;
alter table public.admin_audit enable row level security;

-- users: a user can read its own row (matching auth.uid()).
drop policy if exists "users_self_select" on public.users;
create policy "users_self_select"
  on public.users for select
  using (auth.uid() = id);

-- evaluations: a user can read/insert evaluations they own.
drop policy if exists "evaluations_owner_select" on public.evaluations;
create policy "evaluations_owner_select"
  on public.evaluations for select
  using (auth.uid() = user_id);

drop policy if exists "evaluations_owner_insert" on public.evaluations;
create policy "evaluations_owner_insert"
  on public.evaluations for insert
  with check (auth.uid() = user_id);

drop policy if exists "evaluations_owner_delete" on public.evaluations;
create policy "evaluations_owner_delete"
  on public.evaluations for delete
  using (auth.uid() = user_id);

-- admin_audit: regular users cannot read or write. Only service-role
-- (FastAPI admin endpoints) writes here, so no policies are needed.
