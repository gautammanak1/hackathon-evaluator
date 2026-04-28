# Deploy: Render (API) + Vercel (UI)

Single repo: backend ships on **Render**, frontend on **Vercel**. GitHub Actions runs **CI** on push/PR (`.github/workflows/ci.yml`).

## 1. Backend — Render

1. Push this repo to GitHub.
2. In [Render](https://render.com) → **New** → **Blueprint** (or **Web Service**).
   - **Blueprint:** connect the repo; Render detects root `render.yaml`.
   - **Web Service (manual):**
     - **Root directory:** repository root (leave default where `requirements.txt` lives).
     - **Runtime:** Python 3.11.
     - **Build command:**  
       `pip install --upgrade pip && pip install -r requirements.txt && pip install -e .`
     - **Start command:**  
       `uvicorn main:app --host 0.0.0.0 --port $PORT --app-dir backend`
     - **Health check path:** `/health`
3. **Environment variables** (Render dashboard):
   - `OPENAI_API_KEY` — required for LLM evaluations.
   - `API_CORS_ORIGINS` — comma-separated origins allowed to call the API. Must include your Vercel site, e.g. `https://my-app.vercel.app` (no trailing slash). For previews you can add multiple URLs separated by commas.
   - Optional: `INNOVATION_LABS_DOCS`, `INNOVATION_LAB_AGENTS`, `DOC_URL_MANIFEST`, etc. (see root `.env.example`).
4. Copy the public service URL (e.g. `https://hackathon-evaluator-api.onrender.com`).

**Note:** Free/starter tiers may sleep; first request after idle can be slow. For production traffic consider a paid instance.

## 2. Frontend — Vercel

1. [Vercel](https://vercel.com) → **Add New** → **Project** → import the **same** GitHub repo.
2. **Root Directory:** set to `frontend` (important for this monorepo).
3. **Environment variables:**
   - `NEXT_PUBLIC_API_URL` = your Render API URL, e.g. `https://hackathon-evaluator-api.onrender.com`  
     (no path; no trailing slash needed but both usually work).
4. Deploy. Update `API_CORS_ORIGINS` on Render whenever you add a new production or preview URL that must call the API.

`frontend/vercel.json` pins `npm ci` for reproducible installs.

## 3. CI (GitHub Actions)

Workflow file: `.github/workflows/ci.yml`

- **backend:** `pip install` + `pytest tests/`
- **frontend:** `npm ci` + `npm run build`

No deploy steps are included; Render and Vercel connect to GitHub for their own auto-deploys.

## Checklist

| Where  | Variable | Purpose |
|--------|----------|---------|
| Render | `OPENAI_API_KEY` | LLM + embeddings |
| Render | `API_CORS_ORIGINS` | Allow your Vercel origin(s) |
| Vercel | `NEXT_PUBLIC_API_URL` | Browser → API base URL |

After changing CORS or the API URL, redeploy or wait for the next request as applicable.
