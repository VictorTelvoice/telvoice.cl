#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const REAL = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";
const CN513 = "acef4e67-ebda-4db8-a948-38db812127df";

function mask(s) {
  if (!s) return s;
  const d = String(s).replace(/\D/g, "");
  return d.length >= 3 ? `***${d.slice(-3)}` : "?";
}

const cs = process.env.DATABASE_URL?.trim();
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await c.connect();

const cn513 = (
  await c.query("SELECT id, number, status, capabilities FROM client_numbers WHERE id = $1", [
    CN513,
  ])
).rows[0];

const inv513 = (
  await c.query(
    "SELECT id, sim_slot, gateway_id, e164_number, webhook_connected FROM real_number_inventory WHERE current_client_number_id = $1",
    [CN513],
  )
).rows[0];

const inboundCount = (
  await c.query("SELECT count(*)::int n FROM inbound_sms_messages WHERE company_id = $1", [
    REAL,
  ])
).rows[0].n;

const inbound = (
  await c.query(
    `SELECT id, company_id, client_number_id, status, source, received_at,
            right(regexp_replace(to_number, '[^0-9]', '', 'g'), 3) AS suffix,
            left(body, 120) AS body_preview
     FROM inbound_sms_messages
     WHERE company_id = $1 OR right(regexp_replace(to_number, '[^0-9]', '', 'g'), 3) = '513'
     ORDER BY received_at DESC LIMIT 25`,
    [REAL],
  )
).rows;

const telsim513 = inv513?.sim_slot
  ? (
      await c.query(
        `SELECT id, slot_id, sender_from, left(content, 120) AS content_preview, received_at, line_phone
         FROM telsim_inbound_sms
         WHERE slot_id = $1 OR right(regexp_replace(line_phone, '[^0-9]', '', 'g'), 3) = '513'
         ORDER BY received_at DESC LIMIT 25`,
        [inv513.sim_slot],
      )
    ).rows
  : [];

const telsimRecent = (
  await c.query(
    `SELECT id, slot_id, sender_from, left(content, 80) AS content_preview, received_at, line_phone
     FROM telsim_inbound_sms
     WHERE received_at > NOW() - INTERVAL '48 hours'
     ORDER BY received_at DESC LIMIT 30`,
  )
).rows;

const binding = inv513?.sim_slot
  ? (
      await c.query("SELECT * FROM telsim_slot_bindings WHERE slot_id = $1", [inv513.sim_slot])
    ).rows[0]
  : null;

const allBindings = (
  await c.query(
    `SELECT slot_id, right(regexp_replace(verify_phone, '[^0-9]', '', 'g'), 3) AS suffix
     FROM telsim_slot_bindings ORDER BY updated_at DESC LIMIT 30`,
  )
).rows;

const invLican = (
  await c.query(
    `SELECT right(regexp_replace(e164_number, '[^0-9]', '', 'g'), 3) AS suffix,
            sim_slot, gateway_id, webhook_connected, sales_status
     FROM real_number_inventory WHERE current_company_id = $1`,
    [REAL],
  )
).rows;

console.log(
  JSON.stringify(
    {
      cn513: cn513
        ? { ...cn513, number: mask(cn513.number), capabilities: cn513.capabilities }
        : null,
      inv513: inv513
        ? { ...inv513, e164_number: mask(inv513.e164_number) }
        : null,
      slot_binding: binding
        ? { ...binding, verify_phone: mask(binding.verify_phone) }
        : null,
      inventory_lican: invLican,
      all_slot_bindings: allBindings,
      inbound_count: inboundCount,
      inbound_messages: inbound.map((r) => ({
        ...r,
        to_suffix: r.suffix,
      })),
      telsim_for_513_slot: telsim513.map((r) => ({
        ...r,
        line_phone: mask(r.line_phone),
      })),
      telsim_recent_48h: telsimRecent.map((r) => ({
        slot_id: r.slot_id,
        line_phone: mask(r.line_phone),
        sender_from: r.sender_from,
        received_at: r.received_at,
        preview: r.content_preview,
      })),
    },
    null,
    2,
  ),
);

await c.end();
