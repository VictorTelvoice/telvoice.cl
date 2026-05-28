#!/usr/bin/env bash
# Agrega una empresa a SMS_LIVE_TEST_ALLOWED_COMPANY_IDS (backup .env). No imprime secretos.
set -euo pipefail
cd /var/www/telvoice-sms-agent

COMPANY_ID="${1:?usage: $0 <company-uuid>}"
TS="$(date -u +%Y%m%d-%H%M%S)"
BACKUP=".env.backup.enable-company-${TS}"

cp .env "$BACKUP"
echo "backup_created=${BACKUP}"

python3 - "$COMPANY_ID" <<'PY'
import sys
from pathlib import Path

new_id = sys.argv[1].strip()
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

existing = []
for line in lines:
    if line.startswith("SMS_LIVE_TEST_ALLOWED_COMPANY_IDS="):
        raw = line.split("=", 1)[1].strip()
        existing = [x.strip() for x in raw.split(",") if x.strip()]
        break

if new_id not in existing:
    existing.append(new_id)

set_key("SMS_LIVE_TEST_ALLOWED_COMPANY_IDS", ",".join(existing))

# Campañas CSV: no exigir allowlist de números si ya está en true
set_key("SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST", "true")

path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("updated_keys=SMS_LIVE_TEST_ALLOWED_COMPANY_IDS,SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST")
print("company_added=" + new_id)
print("allowed_company_count=" + str(len(existing)))
PY

python3 - <<'PY'
from pathlib import Path
keys = {
  "SMS_PROVIDER_MODE",
  "SMS_LIVE_TEST_ENABLED",
  "SMS_CAMPAIGN_ENABLED",
  "SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST",
  "SMS_LIVE_TEST_ALLOWED_COMPANY_IDS",
}
for line in Path(".env").read_text(encoding="utf-8", errors="ignore").splitlines():
    k = line.split("=", 1)[0]
    if k in keys:
        print(line)
PY
