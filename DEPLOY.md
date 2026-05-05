# Deploy: Render (API) + Vercel (UI)

Single repo: backend ships on **Render**, frontend on **Vercel**. GitHub Actions runs **CI** on push/PR (`.github/workflows/ci.yml`) and **optionally** hits a Render deploy hook (`.github/workflows/render-deploy.yml`).

**This project's GitHub remote:** `https://github.com/gautammanak1/hackathon-evaluator`.

**Live URLs:**
- API: `https://hackathon-evaluator-api.onrender.com`
- UI: `https://hackathon-evaluator-one.vercel.app`
- MCP (SSE): `https://hackathon-evaluator-api.onrender.com/mcp/sse` — discover via `GET /meta/mcp`.

## 0. Push without leaking secrets

`.gitignore` already excludes every `.env*` file (root, `frontend/`, `backend/`). Only the `*.env.example` templates are committed. Sanity-check before pushing:

```bash
git ls-files | grep -E "(^|/)\.env(\..*)?$"   # should print only *.env.example
```

If you accidentally tracked one earlier, run `git rm --cached path/to/.env` and re-commit.

## 1. Backend — Render

1. Connect the repo on [Render](https://render.com) → **New** → **Blueprint**. Render reads `render.yaml` at the repo root.
2. **Environment variables** (Render dashboard → Web Service → **Environment**). Required:
   - `OPENAI_API_KEY`
   - `API_CORS_ORIGINS` — comma-separated, must include the Vercel URL (e.g. `https://hackathon-evaluator-one.vercel.app`).
   - `MCP_PUBLIC_BASE_URL` — public origin used by `/meta/mcp` (e.g. `https://hackathon-evaluator-api.onrender.com`).
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — persistence (results, jobs).
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET` — admin login.
   - `GITHUB_TOKEN` (optional PAT fallback when users haven't connected OAuth).
3. Optional / tuning:
   - `OPENAI_MODEL` (default `gpt-4o`), `OPENAI_EMBEDDING_MODEL` (`text-embedding-3-small`).
   - `FETCH_DOCS_VECTOR_STORE_ID` — leave empty to skip OpenAI FileSearch (Web Search still works).
   - `FETCH_DOCS_AGENT_MODEL`, `OPENAI_AGENTS_TRACING_ENABLED`, `HTTP_LOG_DEBUG`.
   - `EVAL_THREAD_POOL_WORKERS` (default `12`) — concurrent evaluation throughput.
   - `MCP_ENABLED` (`true`), `MCP_MOUNT_PATH` (`/mcp`).
   - `GITHUB_AUTO_ISSUE` (default `false`; MCP callers always opt out regardless).
   - `REVIEW_MODE=strict_reviewer`.
4. Build / start (also encoded in `render.yaml`):
   - Build: `pip install --upgrade pip && pip install -r requirements.txt && pip install -e .`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT --app-dir backend`
   - Health: `/health`
5. Copy the public URL once Render finishes building.

Free tier sleeps when idle; first request after sleep is slow.

## 2. Frontend — Vercel

1. [Vercel](https://vercel.com) → **Add New** → **Project** → import the **same** repo.
2. **Root Directory:** `frontend`.
3. **Environment variables** (Vercel project → **Settings** → **Environment Variables**, all environments unless noted):
   - `NEXT_PUBLIC_API_URL` = Render API URL (e.g. `https://hackathon-evaluator-api.onrender.com`).
   - `BACKEND_API_URL` (optional) = same as above; used by Next API routes if set.
   - `NEXTAUTH_URL` = Vercel site URL (e.g. `https://hackathon-evaluator-one.vercel.app`). Use the matching preview URL on the Preview environment.
   - `NEXTAUTH_SECRET` = `openssl rand -hex 32`.
   - `GITHUB_OAUTH_ID` + `GITHUB_OAUTH_SECRET` (or `GITHUB_ID` / `GITHUB_SECRET`) — GitHub OAuth app callback `${NEXTAUTH_URL}/api/auth/callback/github`.
   - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same Supabase project as the backend.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET` — must match Render values.
   - Optional: `UAGENT_HTTP_BASE`, `NEXT_PUBLIC_UAGENT_HTTP`, `ASI_ONE_API_KEY`.
4. Deploy. Whenever you add a new Vercel preview/production URL that hits the API, append it to `API_CORS_ORIGINS` on Render.

`frontend/vercel.json` pins `npm ci` for reproducible installs.

## 3. CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`

- **backend:** `pip install -r requirements.txt && pip install -e .`, then `pytest tests/`.
- **frontend:** `npm ci` + `npm run build` (root: `frontend/`).

`render-deploy.yml` POSTs the Render deploy hook (set repo secret `RENDER_DEPLOY_HOOK_URL`) when files under `backend/`, `requirements.txt`, `pyproject.toml`, or `render.yaml` change on `main`.

## Quick env checklist

| Where  | Variable                                           | Purpose                                      |
|--------|----------------------------------------------------|----------------------------------------------|
| Render | `OPENAI_API_KEY`                                   | LLM + embeddings                             |
| Render | `API_CORS_ORIGINS`                                 | Allow Vercel origin(s)                       |
| Render | `MCP_PUBLIC_BASE_URL`                              | Correct SSE URL in `/meta/mcp`               |
| Render | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`       | Backend persistence                          |
| Render | `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_JWT_SECRET` | Admin login                              |
| Vercel | `NEXT_PUBLIC_API_URL`                              | Browser → API base URL                       |
| Vercel | `NEXTAUTH_URL` / `NEXTAUTH_SECRET`                 | NextAuth session                             |
| Vercel | `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET`          | GitHub sign-in                               |
| Vercel | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Read evaluation results            |
| Vercel | `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_JWT_SECRET` | Admin login (must match Render)           |
| GitHub | `RENDER_DEPLOY_HOOK_URL` (optional)                | Trigger Render redeploy from CI              |
