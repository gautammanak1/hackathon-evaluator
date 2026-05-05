-- Hackathon Evaluator: initial schema
-- Run this in your Supabase project's SQL editor first.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  github_id    bigint unique not null,
  github_login text   unique not null,
  email        text,
  name         text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists users_github_login_idx on public.users (github_login);

create table if not exists public.evaluations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete cascade,
  repo_url         text not null,
  repo_owner       text not null,
  repo_name        text not null,
  branch           text,
  score            numeric,
  classification   text,
  status           text not null default 'complete',
  payload          jsonb not null,
  suggestions      jsonb not null default '[]'::jsonb,
  doc_links        jsonb not null default '[]'::jsonb,
  deep_analysis    jsonb not null default '{}'::jsonb,
  github_issue_url text,
  error            text,
  created_at       timestamptz not null default now()
);

create index if not exists evaluations_user_id_idx     on public.evaluations (user_id);
create index if not exists evaluations_created_at_idx  on public.evaluations (created_at desc);
create index if not exists evaluations_repo_owner_idx  on public.evaluations (repo_owner);
create index if not exists evaluations_repo_name_idx   on public.evaluations (repo_name);

create table if not exists public.admin_audit (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  target_user uuid references public.users(id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_created_at_idx on public.admin_audit (created_at desc);
