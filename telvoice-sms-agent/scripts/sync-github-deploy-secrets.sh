#!/usr/bin/env bash
# Sincroniza secretos de deploy en GitHub Actions (requiere gh autenticado).
# No imprime claves privadas. Uso local:
#   gh auth login
#   ./scripts/sync-github-deploy-secrets.sh
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-VictorTelvoice/telvoice.cl}"
KEY_PATH="${DEPLOY_SSH_KEY_PATH:-$HOME/.ssh/telvoice_github_actions}"
HOST="${VPS_HOST:-agent.telvoice.cl}"
USER="${VPS_USER:-root}"

if ! command -v gh >/dev/null; then
  echo "Instala GitHub CLI (gh) y ejecuta: gh auth login"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "gh no autenticado. Ejecuta: gh auth login"
  exit 1
fi
if [ ! -f "$KEY_PATH" ]; then
  echo "No existe clave privada en: $KEY_PATH"
  exit 1
fi

echo "→ Huella local de la clave (pública derivada):"
ssh-keygen -lf "$KEY_PATH"
echo "→ Esperada en VPS authorized_keys: SHA256:THmI/vVwUwpM3zN3Mc5IxYiaMH4PEmLs7Kyo6rq9TMQ github-actions-telvoice-deploy"
echo "→ Actualizando secretos en ${REPO} (sin mostrar valores)..."

gh secret set VPS_HOST --repo "$REPO" --body "$HOST"
gh secret set VPS_USER --repo "$REPO" --body "$USER"
gh secret set VPS_SSH_KEY --repo "$REPO" < "$KEY_PATH"

echo "Listo. Valida con: gh workflow run \"Test SSH agent.telvoice.cl\" --ref main"
