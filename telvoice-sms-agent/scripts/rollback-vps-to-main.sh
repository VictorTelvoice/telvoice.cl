#!/usr/bin/env bash
# Rollback inmediato del agente a origin/main (producción controlada Fase 3).
# Ejecutar EN EL SERVIDOR si falla el deploy feature.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
HEALTH_URL="${PUBLIC_APP_URL:-https://agent.telvoice.cl}/health"

echo "=== Rollback agent.telvoice.cl → main ==="
cd "$REPO_ROOT"
git fetch origin --prune
git checkout main
git pull --ff-only origin main

cd "$ROOT"
npm ci
rm -rf dist
npm run build
test -f public/app-panel.css || { echo "Falta public/app-panel.css"; exit 1; }

pm2 restart telvoice-sms-agent --update-env 2>/dev/null || {
  pm2 delete telvoice-sms-agent 2>/dev/null || true
  pm2 start ecosystem.config.cjs --update-env
}
pm2 save 2>/dev/null || true

echo "→ health post-rollback"
curl -s "$HEALTH_URL" && echo ""
echo "Rollback completado. Verifica que build vuelva a main (p. ej. 6e7ba28)."
