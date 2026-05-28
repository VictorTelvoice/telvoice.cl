#!/usr/bin/env bash
# Actualiza allowlist live_test en .env (con backup). No imprime secretos.
set -euo pipefail
cd /var/www/telvoice-sms-agent

LICANTRAVEL_ID="54601663-f35f-4c26-9410-a9d2dc0ad697"
AUTHORIZED_NUMBER="+56934449937"
TS="$(date -u +%Y%m%d-%H%M%S)"
BACKUP=".env.backup.licantravel-live-test-${TS}"

cp .env "$BACKUP"
echo "backup_created=${BACKUP}"

python3 - <<'PY'
from pathlib import Path
import re

path = Path(".env")
lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()

LICANTRAVEL = "54601663-f35f-4c26-9410-a9d2dc0ad697"
AUTHORIZED = "+56934449937"
KEEP_DEMO = "6cd1db92-d5c7-45e0-8548-df8907843350"

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

# Empresas: demo QA existente + Licantravel
company_ids = [KEEP_DEMO, LICANTRAVEL]
set_key("SMS_LIVE_TEST_ALLOWED_COMPANY_IDS", ",".join(company_ids))
set_key("SMS_LIVE_TEST_ALLOWED_NUMBERS", AUTHORIZED)

# Mantener modo/provider (no tocar secretos)
for k, v in [
    ("SMS_PROVIDER_MODE", "live_test"),
    ("SMS_PROVIDER", "real_api"),
]:
    for i, line in enumerate(lines):
        if line.startswith(k + "="):
            lines[i] = f"{k}={v}"
            break

path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("updated_keys=SMS_LIVE_TEST_ALLOWED_COMPANY_IDS,SMS_LIVE_TEST_ALLOWED_NUMBERS")
print("authorized_number=" + AUTHORIZED)
print("allowed_company_ids=" + ",".join(company_ids))
PY

# Mostrar solo claves SMS (sin secretos)
python3 - <<'PY'
from pathlib import Path
keys = {
  "SMS_PROVIDER_MODE",
  "SMS_PROVIDER",
  "SMS_LIVE_TEST_ENABLED",
  "SMS_LIVE_TEST_ALLOWED_COMPANY_IDS",
  "SMS_LIVE_TEST_ALLOWED_NUMBERS",
}
for line in Path(".env").read_text(encoding="utf-8", errors="ignore").splitlines():
    k = line.split("=", 1)[0]
    if k in keys:
        print(line)
PY
