#!/usr/bin/env bash
# Producción: bypass comercial por rate plan + defaults retail en .env (con backup).
set -euo pipefail
cd /var/www/telvoice-sms-agent

TS="$(date -u +%Y%m%d-%H%M%S)"
BACKUP=".env.backup.commercial-send-${TS}"
cp .env "$BACKUP"
echo "backup_created=${BACKUP}"

python3 - <<'PY'
from pathlib import Path

path = Path(".env")
lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()

def set_key(key: str, value: str):
    global lines
    out = []
    found = False
    for line in lines:
        if line.startswith(key + "="):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    lines = out

set_key("ALLOW_RATE_PLAN_COMPANIES_TO_SEND", "true")
set_key("PUBLIC_CHECKOUT_DEFAULT_MAX_TPS", "2")
set_key("PUBLIC_CHECKOUT_DEFAULT_CAMPAIGNS_ENABLED", "true")
set_key("SMS_PANEL_SKIP_NUMBER_WHITELIST", "true")
set_key("SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST", "true")
set_key("SMS_LIVE_TEST_ALLOWED_NUMBERS", "")

path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("updated=ALLOW_RATE_PLAN_COMPANIES_TO_SEND,PUBLIC_CHECKOUT_DEFAULT_*,SMS_PANEL_SKIP_NUMBER_WHITELIST,SMS_LIVE_TEST_ALLOWED_NUMBERS")
PY

python3 - <<'PY'
from pathlib import Path
keys = {
  "ALLOW_RATE_PLAN_COMPANIES_TO_SEND",
  "PUBLIC_CHECKOUT_DEFAULT_MAX_TPS",
  "PUBLIC_CHECKOUT_DEFAULT_CAMPAIGNS_ENABLED",
  "SMS_PANEL_SKIP_NUMBER_WHITELIST",
  "SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST",
  "SMS_LIVE_TEST_ALLOWED_NUMBERS",
}
for line in Path(".env").read_text(encoding="utf-8", errors="ignore").splitlines():
    if line.split("=", 1)[0] in keys:
        print(line)
PY
