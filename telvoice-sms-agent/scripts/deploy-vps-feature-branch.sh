#!/usr/bin/env bash
# Despliegue controlado en VPS desde una rama feature (sin merge a main).
# Ejecutar EN EL SERVIDOR dentro del directorio del agente.
set -euo pipefail

BRANCH="${1:-feature/sim-checkout-fase1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"

echo "→ Despliegue controlado rama: ${BRANCH}"
cd "$REPO_ROOT"
git fetch origin --prune
git checkout "$BRANCH"
git pull --ff-only "origin/${BRANCH}"

cd "$ROOT"
npm ci
rm -rf dist
npm run build
test -f public/app-panel.css || { echo "Falta public/app-panel.css"; exit 1; }
APP_ROOT="$ROOT" npm run verify:agent-deploy

pm2 delete telvoice-sms-agent 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
pm2 save 2>/dev/null || true

curl -sf "${PUBLIC_APP_URL:-http://127.0.0.1:3001}/health" && echo ""
echo "Listo (${BRANCH}). Verifica build en /health y allowlist SIM en .env."
