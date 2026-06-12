#!/usr/bin/env bash
# Despliegue controlado en VPS desde una rama feature (sin merge a main).
# Ejecutar EN EL SERVIDOR. Incluye snapshot pre-deploy para rollback.
set -euo pipefail

BRANCH="${1:-feature/sim-checkout-fase1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
SNAPSHOT_DIR="${TELVOICE_DEPLOY_SNAPSHOT_DIR:-/tmp/telvoice-prod-deploy-snapshot}"
HEALTH_URL="${PUBLIC_APP_URL:-https://agent.telvoice.cl}/health"

mkdir -p "$SNAPSHOT_DIR"

echo "=== Pre-deploy snapshot (rollback) ==="
cd "$REPO_ROOT"
CURRENT_SHA="$(git rev-parse HEAD)"
echo "SHA actual antes del deploy: ${CURRENT_SHA}"
printf '%s\n' "$CURRENT_SHA" > "${SNAPSHOT_DIR}/pre-deploy-sha.txt"

echo "→ health actual"
curl -s "$HEALTH_URL" | tee "${SNAPSHOT_DIR}/pre-deploy-health.json"
echo ""

echo "→ Despliegue controlado rama: ${BRANCH}"
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

echo "→ health post-deploy"
curl -sf "$HEALTH_URL" && echo ""
echo "Listo (${BRANCH}). Snapshot en ${SNAPSHOT_DIR}"
echo "Si falla: bash scripts/rollback-vps-to-main.sh"
