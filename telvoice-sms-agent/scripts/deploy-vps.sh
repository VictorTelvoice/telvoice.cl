#!/usr/bin/env bash
# Actualiza el agente en el VPS (ejecutar EN EL SERVIDOR dentro del clone del repo).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ git pull"
git pull origin main

echo "→ npm ci && build"
npm ci
npm run build

echo "→ pm2 restart"
if pm2 describe telvoice-sms-agent >/dev/null 2>&1; then
  pm2 restart telvoice-sms-agent
else
  pm2 start dist/index.js --name telvoice-sms-agent
fi
pm2 save 2>/dev/null || true

echo "→ health"
curl -sf "${PUBLIC_APP_URL:-http://127.0.0.1:3001}/health" && echo ""
echo "Listo. Panel: ${PUBLIC_APP_URL:-http://localhost:3001}/admin"
