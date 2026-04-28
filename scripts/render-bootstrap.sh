#!/usr/bin/env bash
# Terminal helper: validate Blueprint, remind where env vars go, optional GitHub push.
# Usage:
#   ./scripts/render-bootstrap.sh              # validate + instructions
#   ./scripts/render-bootstrap.sh push         # git push origin main (after you committed)
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== render.yaml validation =="
if command -v render >/dev/null 2>&1; then
  render blueprints validate
else
  echo "Install Render CLI: https://render.com/docs/cli"
fi

echo ""
echo "== Where to set variables =="
echo "  Render (live API): https://dashboard.render.com"
echo "    - OPENAI_API_KEY"
echo "    - API_CORS_ORIGINS  (e.g. https://your-app.vercel.app)"
echo "  GitHub repo → Settings → Secrets:"
echo "    - RENDER_DEPLOY_HOOK_URL  (optional; for .github/workflows/render-deploy.yml)"
echo ""
echo "  Local dev: copy .env.example to .env (never commit .env)."

if [[ "${1:-}" == "push" ]]; then
  git push -u origin main
fi
