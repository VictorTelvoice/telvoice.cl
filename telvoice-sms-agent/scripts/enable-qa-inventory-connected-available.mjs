/**
 * Habilita números QA en inventario solo si pasan validación técnica telsim.
 * Uso: node scripts/enable-qa-inventory-connected-available.mjs [--apply] [--suffix=021,030]
 */
import "dotenv/config";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const suffixArg = process.argv.find((a) => a.startsWith("--suffix="));
const SUFFIXES = (suffixArg ? suffixArg.split("=")[1] : "021,030")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_INBOUND_AGE_DAYS = 7;
const PROTECT_SUFFIX = "513";

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
});

async function validateCandidate(row) {
  const blockers = [];
  const suffix = row.suffix;

  if (suffix === PROTECT_SUFFIX) blockers.push("protected_active_licantravel");

  if (row.sales_status !== "preconfigured_pending") {
    blockers.push(`sales_status=${row.sales_status}`);
  }
  if (row.current_order_id) blockers.push("has_current_order");
  if (row.current_company_id) blockers.push("has_current_company");

  if (!row.sim_slot) blockers.push("missing_sim_slot");

  const binding = row.sim_slot
    ? (
        await client.query(
          `SELECT slot_id, verify_phone, updated_at FROM telsim_slot_bindings WHERE slot_id = $1`,
          [row.sim_slot],
        )
      ).rows[0]
    : null;

  if (!binding?.verify_phone) blockers.push("missing_telsim_slot_binding");

  const inbound = row.sim_slot
    ? (
        await client.query(
          `SELECT id, received_at FROM telsim_inbound_sms WHERE slot_id = $1 ORDER BY received_at DESC LIMIT 1`,
          [row.sim_slot],
        )
      ).rows[0]
    : null;

  if (!inbound) blockers.push("no_telsim_inbound_history");

  let inboundAgeDays = null;
  if (inbound?.received_at) {
    inboundAgeDays =
      (Date.now() - new Date(inbound.received_at).getTime()) / (86400 * 1000);
    if (inboundAgeDays > MAX_INBOUND_AGE_DAYS) {
      blockers.push(`inbound_stale_${inboundAgeDays.toFixed(1)}d`);
    }
  }

  return {
    suffix,
    inventory_id: row.id,
    sim_slot: row.sim_slot,
    binding,
    last_inbound_at: inbound?.received_at ?? null,
    inbound_age_days: inboundAgeDays,
    blockers,
    ready: blockers.length === 0,
  };
}

async function main() {
  await client.connect();
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN ===", "suffixes", SUFFIXES);

  const inv = await client.query(
    `SELECT id, sales_status, connection_status, webhook_connected, sim_slot,
            current_order_id, current_company_id,
            right(regexp_replace(e164_number,'[^0-9]','','g'),3) AS suffix
     FROM real_number_inventory
     WHERE right(regexp_replace(e164_number,'[^0-9]','','g'),3) = ANY($1::text[])`,
    [SUFFIXES],
  );

  const results = [];
  for (const row of inv.rows) {
    results.push(await validateCandidate(row));
  }

  console.log("VALIDATION", JSON.stringify(results, null, 2));

  const ready = results.filter((r) => r.ready);
  if (!ready.length) {
    console.log("No candidates ready — not enabling inventory.");
    await client.end();
    return;
  }

  if (!APPLY) {
    console.log(`Would enable ${ready.length} number(s). Run with --apply.`);
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    for (const r of ready) {
      const { rowCount } = await client.query(
        `UPDATE real_number_inventory SET
           sales_status = 'connected_available',
           connection_status = 'connected',
           webhook_connected = true,
           metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb,
           updated_at = now()
         WHERE id = $1
           AND sales_status = 'preconfigured_pending'
           AND current_order_id IS NULL
           AND current_company_id IS NULL`,
        [
          r.inventory_id,
          JSON.stringify({
            qa_enabled_at: new Date().toISOString(),
            qa_enabled_by: "enable-qa-inventory-connected-available",
            qa_enabled_reason: "telsim_slot_binding_and_recent_inbound_validated",
            qa_last_inbound_at: r.last_inbound_at,
          }),
        ],
      );
      console.log("enabled", r.suffix, "rows", rowCount);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
