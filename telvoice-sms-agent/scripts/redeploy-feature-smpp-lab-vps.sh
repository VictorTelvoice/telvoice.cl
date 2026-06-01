#!/usr/bin/env bash
# Redeploy temporal feature/smpp-lab-wholesale-ops al VPS (sin merge a main).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE_DIR="${1:-}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/telvoice_github_actions}"
REMOTE="root@agent.telvoice.cl"
APP_PATH="/var/www/telvoice-sms-agent"
STAGE="/tmp/telvoice-smpp-deploy-$$"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$STAGE"
if [ -n "$SOURCE_DIR" ]; then
  rsync -a --delete \
    --exclude node_modules --exclude .env --exclude .env.smpp-vendor --exclude dist --exclude .git \
    "$SOURCE_DIR/" "$STAGE/telvoice-sms-agent/"
else
  git -C "$REPO_ROOT" archive feature/smpp-lab-wholesale-ops telvoice-sms-agent | tar -x -C "$STAGE"
fi

rsync -az --delete \
  --exclude node_modules --exclude .env --exclude .env.smpp-vendor --exclude dist --exclude .git \
  -e "ssh -i $SSH_KEY" \
  "$STAGE/telvoice-sms-agent/" \
  "$REMOTE:$APP_PATH/"

ssh -i "$SSH_KEY" "$REMOTE" "set -e
cd $APP_PATH
npm ci
npm run build
echo \"smpp_routes=\$(grep -c smpp-lab dist/routes/admin.routes.js)\"
node scripts/verify-smpp-create-route.mjs
pm2 restart telvoice-sms-agent --update-env
echo 'feature_branch=feature/smpp-lab-wholesale-ops' > .feature-deploy-active
date -u +'%Y-%m-%dT%H:%M:%SZ' >> .feature-deploy-active
curl -sf http://127.0.0.1:3001/health >/dev/null && echo health:ok
"

echo "Redeploy feature/smpp-lab-wholesale-ops complete."
