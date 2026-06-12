#!/usr/bin/env node
/** Pre-check antes de prueba inbound real (***021 / ***513). */
import "dotenv/config";
import pg from "pg";

const REAL = process.env.COMPANY_ID ?? "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";
const SUFFIXES = (process.env.SUFFIXES ?? "021,513").split(",").map((s) => s.trim());

function mask(s) {
  if (!s) return s;
  const d = String(s).replace(/\D/g, "");
  return d.length >= 3 ? `***${d.slice(-3)}` : "?";
}

function maskSlot(s) {
  if (!s) return null;
  const t = String(s);
  return t.length > 12 ? `${t.slice(0, 10)}…${t.slice(-4)}` : t;
}

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}

const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await c.connect();

const wallet = (
  await c.query(
    `SELECT available_sms, total_purchased_sms, consumed_sms FROM company_sms_wallets WHERE company_id = $1`,
    [REAL],
  )
).rows[0];

const inboundCount = (
  await c.query(`SELECT count(*)::int n FROM inbound_sms_messages WHERE company_id = $1`, [
    REAL,
  ])
).rows[0].n;

const numbers = [];
for (const suffix of SUFFIXES) {
  const inv = (
    await c.query(
      `SELECT i.id, i.sim_slot, i.gateway_id, i.webhook_connected, i.sales_status,
              i.e164_number, cn.id AS cn_id, cn.status AS cn_status, cn.capabilities
       FROM real_number_inventory i
       JOIN client_numbers cn ON cn.id = i.current_client_number_id
       WHERE i.current_company_id = $1
         AND right(regexp_replace(i.e164_number, '[^0-9]', '', 'g'), 3) = $2`,
      [REAL, suffix],
    )
  ).rows[0];

  const binding = inv?.sim_slot
    ? (
        await c.query(`SELECT slot_id, verify_phone FROM telsim_slot_bindings WHERE slot_id = $1`, [
          inv.sim_slot,
        ])
      ).rows[0]
    : null;

  const telsimRaw = inv?.sim_slot
    ? (
        await c.query(
          `SELECT count(*)::int n, max(received_at) AS last_at FROM telsim_inbound_sms WHERE slot_id = $1`,
          [inv.sim_slot],
        )
      ).rows[0]
    : { n: 0, last_at: null };

  const inboundFor = (
    await c.query(
      `SELECT count(*)::int n, max(received_at) AS last_at
       FROM inbound_sms_messages
       WHERE company_id = $1
         AND right(regexp_replace(to_number, '[^0-9]', '', 'g'), 3) = $2`,
      [REAL, suffix],
    )
  ).rows[0];

  numbers.push({
    suffix,
    inventory: inv
      ? {
          sales_status: inv.sales_status,
          sim_slot: maskSlot(inv.sim_slot),
          gateway_id: inv.gateway_id ? `${String(inv.gateway_id).slice(0, 12)}…` : null,
          webhook_connected: inv.webhook_connected,
          e164: mask(inv.e164_number),
        }
      : null,
    client_number: inv
      ? { id: inv.cn_id, status: inv.cn_status, receive_sms: inv.capabilities?.receive_sms === true }
      : null,
    slot_binding: binding
      ? { slot: maskSlot(binding.slot_id), verify: mask(binding.verify_phone) }
      : null,
    telsim_raw_count: telsimRaw?.n ?? 0,
    telsim_raw_last_at: telsimRaw?.last_at,
    inbox_count: inboundFor?.n ?? 0,
    inbox_last_at: inboundFor?.last_at,
    ready_for_inbound_test:
      inv?.cn_status === "active" &&
      inv?.sales_status === "active_assigned" &&
      Boolean(inv?.sim_slot) &&
      Boolean(binding?.verify_phone),
  });
}

const telsimFields = (
  await c.query(
    `SELECT
       count(*) FILTER (WHERE line_phone IS NOT NULL)::int AS with_line_phone,
       count(*) FILTER (WHERE slot_id IS NOT NULL)::int AS with_slot_id,
       count(*)::int AS total
     FROM telsim_inbound_sms
     WHERE received_at > NOW() - INTERVAL '30 days'`,
  )
).rows[0];

const rawKeysSample = (
  await c.query(
    `SELECT raw_payload FROM telsim_inbound_sms
     WHERE raw_payload IS NOT NULL ORDER BY received_at DESC LIMIT 5`,
  )
).rows;

const keyFreq = {};
for (const row of rawKeysSample) {
  const payload = row.raw_payload ?? {};
  for (const k of Object.keys(payload)) {
    keyFreq[k] = (keyFreq[k] ?? 0) + 1;
  }
}

console.log(
  JSON.stringify(
    {
      company_id: REAL,
      wallet,
      inbound_total: inboundCount,
      numbers,
      telsim_inbound_30d: telsimFields,
      telsim_payload_keys_sample: keyFreq,
    },
    null,
    2,
  ),
);

await c.end();
