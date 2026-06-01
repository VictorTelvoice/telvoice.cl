#!/usr/bin/env bash
# Actualiza el agente en el VPS (ejecutar EN EL SERVIDOR dentro del clone del repo).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ git pull"
git pull origin main

echo "→ npm ci && build"
npm ci
rm -rf dist
npm run build
test -f public/app-panel.css || { echo "Falta public/app-panel.css — ejecuta npm run build:app-css"; exit 1; }
APP_ROOT="$ROOT" npm run verify:agent-deploy

echo "→ pm2 (ecosystem $ROOT)"
pm2 delete telvoice-sms-agent 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
pm2 save 2>/dev/null || true

echo "→ health"
curl -sf "${PUBLIC_APP_URL:-http://127.0.0.1:3001}/health" && echo ""
echo "Listo. Panel: ${PUBLIC_APP_URL:-http://localhost:3001}/admin"
