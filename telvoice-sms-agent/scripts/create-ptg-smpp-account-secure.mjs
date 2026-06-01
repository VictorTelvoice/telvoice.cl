#!/usr/bin/env node
/**
 * Crea o actualiza PTG_2WAY en wholesale_smpp_connections.
 * No ejecuta bind ni Send test SMS. No imprime passwords.
 *
 * Password desde (en orden):
 * 1. SMPP_VENDOR_PASSWORD en entorno
 * 2. .env.smpp-vendor (chmod 600 recomendado, gitignored)
 * 3. Prompt oculto en TTY (--prompt)
 *
 * Uso VPS:
 *   node scripts/create-ptg-smpp-account-secure.mjs
 *   node scripts/create-ptg-smpp-account-secure.mjs --prompt
 *   node scripts/create-ptg-smpp-account-secure.mjs --remove-password-from-env
 */
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENDOR_ENV = join(__dirname, "../.env.smpp-vendor");
const PTG_PROVIDER_ID = "ba7a58fa-f0b3-47c7-85b0-2849e7997d74";

const args = new Set(process.argv.slice(2));
const usePrompt = args.has("--prompt");
const removePasswordFromEnv = args.has("--remove-password-from-env");

function loadVendorEnv() {
  if (!existsSync(VENDOR_ENV)) return false;
  for (const line of readFileSync(VENDOR_ENV, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k.startsWith("SMPP_VENDOR_") && !process.env[k]) {
      process.env[k] = v;
    }
  }
  return true;
}

async function readPasswordPrompt() {
  if (!input.isTTY) {
    console.error("No TTY for --prompt. Use .env.smpp-vendor or SMPP_VENDOR_PASSWORD.");
    process.exit(1);
  }
  const rl = createInterface({ input, output, terminal: true });
  return new Promise((resolve) => {
    rl.question("SMPP vendor password (hidden): ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    rl._writeToOutput = () => {};
  });
}

function stripPasswordFromVendorEnv() {
  if (!existsSync(VENDOR_ENV)) return;
  const lines = readFileSync(VENDOR_ENV, "utf8").split("\n");
  const next = lines.filter((line) => !line.trim().startsWith("SMPP_VENDOR_PASSWORD="));
  writeFileSync(VENDOR_ENV, `${next.join("\n").replace(/\n+$/, "")}\n`, { mode: 0o600 });
  chmodSync(VENDOR_ENV, 0o600);
  console.log("env_cleanup: SMPP_VENDOR_PASSWORD removed from .env.smpp-vendor");
}

loadVendorEnv();

let password = String(process.env.SMPP_VENDOR_PASSWORD ?? "").trim();
if (!password && usePrompt) {
  password = await readPasswordPrompt();
}
if (!password) {
  console.error("password_source: missing");
  console.error("hint: set SMPP_VENDOR_PASSWORD in .env.smpp-vendor (chmod 600) or use --prompt");
  process.exit(2);
}

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

try {
  const { rows: existing } = await client.query(
    `SELECT id, label FROM wholesale_smpp_connections
     WHERE label = $1 OR system_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    ["PTG_2WAY", "telvoice.2way"],
  );

  const { parseSmppConnectionForm, createSmppConnection, updateSmppConnection } =
    await import("../dist/services/smppLabService.js");

  const formBody = {
    provider_id: PTG_PROVIDER_ID,
    label: "PTG_2WAY",
    account_type: "smpp",
    account_active: "yes",
    host: "213.239.210.94",
    transmitter_port: "7777",
    receiver_port: "7777",
    system_id: "telvoice.2way",
    password,
    system_type: "",
    bind_type: "transceiver",
    addr_ton: "0",
    addr_npi: "0",
    source_addr_ton: "0",
    source_addr_npi: "0",
    dest_addr_ton: "1",
    dest_addr_npi: "1",
    response_timeout_seconds: "300",
    enquire_link_interval_seconds: "45",
    submit_speed_per_second: "10",
    delay_time_seconds: "0",
    sessions: "1",
    tps_limit: "10",
    message_types_allowed: "Flash SMS, Text, Unicode, Unicode Flash SMS",
    route_type: "direct",
    currency: "USD",
    credit_limit: "100000",
    identifier: "29",
    log_level: "off",
    status: "testing",
    notes: "PTG_2WAY account (secure script).",
  };

  let row;
  if (existing[0]?.id) {
    const input = parseSmppConnectionForm(formBody, { isEdit: true });
    row = await updateSmppConnection(existing[0].id, input);
    console.log("account_action: updated");
  } else {
    const input = parseSmppConnectionForm(formBody, { isEdit: false });
    row = await createSmppConnection(input);
    console.log("account_action: created");
  }

  const verify = await client.query(
    `SELECT id, label, host, system_id, bind_type, status, provider_id,
            (password_encrypted IS NOT NULL AND length(password_encrypted) > 0) AS has_enc
     FROM wholesale_smpp_connections WHERE id = $1`,
    [row.id],
  );
  const v = verify.rows[0];

  console.log("connection_id:", v.id);
  console.log("label:", v.label);
  console.log("provider_id:", v.provider_id);
  console.log("host:", v.host);
  console.log("system_id:", v.system_id);
  console.log("bind_type:", v.bind_type);
  console.log("status:", v.status);
  console.log("password_encrypted:", v.has_enc ? "yes" : "no");
  console.log("password_exposed: no");

  if (removePasswordFromEnv) {
    stripPasswordFromVendorEnv();
  }
} finally {
  await client.end();
}
