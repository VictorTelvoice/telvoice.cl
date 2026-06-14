#!/usr/bin/env node
/**
 * Binding controlado slot Telsim → numeración activa (dry-run por defecto).
 *
 * Uso:
 *   NUMBER_SUFFIX=513 \
 *   TELSIM_SLOT="Skyline-DDNS-XX:YY.YY" \
 *   GATEWAY_ID="telsim-..." \
 *   node scripts/bind-telsim-slot-to-number.mjs
 *
 *   ... --apply   # aplica solo si todas las validaciones pasan
 *
 * Requiere slot físico confirmado: TELSIM_SLOT explícito + historial inbound
 * en ese slot O SLOT_VERIFIED=true (confirmación manual ops).
 */
import "dotenv/config";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const NUMBER_SUFFIX = (process.env.NUMBER_SUFFIX ?? "").trim();
const TELSIM_SLOT = (process.env.TELSIM_SLOT ?? "").trim();
const GATEWAY_ID = (process.env.GATEWAY_ID ?? "").trim();
const COMPANY_ID = (
  process.env.COMPANY_ID ?? "d7a134e0-59f2-4cd0-8bda-9efaf0e27688"
).trim();
const SLOT_VERIFIED = process.env.SLOT_VERIFIED === "true";
const PROTECT_SUFFIX = "021";

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}
if (!NUMBER_SUFFIX || !/^\d{3}$/.test(NUMBER_SUFFIX)) {
  console.error("NUMBER_SUFFIX requerido (3 dígitos, ej. 513)");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
});

function maskE164(raw) {
  if (!raw) return raw;
  const d = String(raw).replace(/\D/g, "");
  return d.length >= 3 ? `***${d.slice(-3)}` : "?";
}

function maskSlot(slot) {
  if (!slot) return slot;
  const s = String(slot);
  if (s.length <= 12) return s.slice(0, 4) + "…";
  return `${s.slice(0, 10)}…${s.slice(-4)}`;
}

async function loadTarget() {
  const inv = await client.query(
    `SELECT i.id AS inventory_id, i.e164_number, i.sim_slot, i.gateway_id,
            i.webhook_connected, i.sales_status, i.current_company_id,
            i.current_client_number_id,
            cn.id AS client_number_id, cn.status AS client_status,
            cn.capabilities, cn.company_id
     FROM real_number_inventory i
     LEFT JOIN client_numbers cn ON cn.id = i.current_client_number_id
     WHERE i.current_company_id = $1
       AND right(regexp_replace(i.e164_number, '[^0-9]', '', 'g'), 3) = $2
     LIMIT 1`,
    [COMPANY_ID, NUMBER_SUFFIX],
  );
  return inv.rows[0] ?? null;
}

async function slotInboundCount(slotId) {
  const r = await client.query(
    `SELECT count(*)::int AS n, max(received_at) AS last_at
     FROM telsim_inbound_sms WHERE slot_id = $1`,
    [slotId],
  );
  return r.rows[0];
}

async function inventoryBySlot(slotId) {
  const r = await client.query(
    `SELECT id, right(regexp_replace(e164_number, '[^0-9]', '', 'g'), 3) AS suffix,
            current_company_id, sales_status
     FROM real_number_inventory WHERE sim_slot = $1`,
    [slotId],
  );
  return r.rows;
}

async function bindingBySlot(slotId) {
  const r = await client.query(
    `SELECT slot_id, verify_phone, updated_at FROM telsim_slot_bindings WHERE slot_id = $1`,
    [slotId],
  );
  return r.rows[0] ?? null;
}

async function bindingByPhone(e164) {
  const r = await client.query(
    `SELECT slot_id, verify_phone FROM telsim_slot_bindings
     WHERE verify_phone = $1 OR right(regexp_replace(verify_phone, '[^0-9]', '', 'g'), 11) =
           right(regexp_replace($1::text, '[^0-9]', '', 'g'), 11)`,
    [e164],
  );
  return r.rows[0] ?? null;
}

function validateGateway(gatewayId) {
  if (!gatewayId) return "missing_gateway_id";
  if (gatewayId.length < 4) return "gateway_id_too_short";
  if (!/^telsim[-_a-z0-9]+$/i.test(gatewayId)) {
    return "gateway_id_format_unexpected";
  }
  return null;
}

function parseCaps(raw) {
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

async function main() {
  await client.connect();
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN ===");
  console.log(
    JSON.stringify({
      suffix: NUMBER_SUFFIX,
      company_id: COMPANY_ID,
      telsim_slot: TELSIM_SLOT ? maskSlot(TELSIM_SLOT) : null,
      gateway_id: GATEWAY_ID ? `${GATEWAY_ID.slice(0, 12)}…` : null,
      slot_verified_flag: SLOT_VERIFIED,
    }),
  );

  const blockers = [];
  const warnings = [];

  if (NUMBER_SUFFIX === PROTECT_SUFFIX && !APPLY) {
    warnings.push(`suffix_${PROTECT_SUFFIX}_protected_use_caution`);
  }

  const row = await loadTarget();
  if (!row) {
    blockers.push("inventory_not_found_for_suffix_and_company");
  } else {
    if (row.company_id !== COMPANY_ID) blockers.push("company_mismatch");
    if (row.sales_status !== "active_assigned") {
      blockers.push(`sales_status=${row.sales_status}`);
    }
    if (row.client_status !== "active") {
      blockers.push(`client_numbers.status=${row.client_status ?? "missing"}`);
    }
    const caps = parseCaps(row.capabilities);
    if (caps.receive_sms !== true) blockers.push("inbound_not_enabled_receive_sms");

    if (row.sim_slot && TELSIM_SLOT && row.sim_slot !== TELSIM_SLOT) {
      blockers.push("number_already_has_different_slot");
    }
    if (row.sim_slot && !TELSIM_SLOT) {
      warnings.push("number_already_has_slot_no_TELSIM_SLOT_env");
    }

    const phoneBinding = row.e164_number
      ? await bindingByPhone(row.e164_number)
      : null;
    if (
      phoneBinding?.slot_id &&
      TELSIM_SLOT &&
      phoneBinding.slot_id !== TELSIM_SLOT
    ) {
      blockers.push("phone_bound_to_different_slot");
    }
  }

  if (!TELSIM_SLOT) {
    blockers.push("TELSIM_SLOT_env_required_for_binding");
  }
  if (!GATEWAY_ID) {
    blockers.push("GATEWAY_ID_env_required_for_binding");
  } else {
    const gwErr = validateGateway(GATEWAY_ID);
    if (gwErr) blockers.push(gwErr);
  }

  let slotPhysicalConfirmed = false;
  if (TELSIM_SLOT) {
    const others = await inventoryBySlot(TELSIM_SLOT);
    const conflict = others.filter(
      (o) => o.id !== row?.inventory_id && o.suffix !== NUMBER_SUFFIX,
    );
    if (conflict.length) {
      blockers.push(`slot_assigned_to_other_suffix_${conflict[0].suffix}`);
    }

    const slotInbound = await slotInboundCount(TELSIM_SLOT);
    slotPhysicalConfirmed =
      SLOT_VERIFIED || (slotInbound?.n ?? 0) > 0;

    if (!slotPhysicalConfirmed) {
      blockers.push("slot_real_no_confirmado");
    }

    const existingBinding = await bindingBySlot(TELSIM_SLOT);
    if (
      existingBinding?.verify_phone &&
      row?.e164_number &&
      existingBinding.verify_phone !== row.e164_number
    ) {
      const otherSuffix = String(existingBinding.verify_phone).replace(/\D/g, "").slice(-3);
      blockers.push(`slot_binding_points_to_other_phone_***${otherSuffix}`);
    }
  }

  const report = {
    target: row
      ? {
          suffix: NUMBER_SUFFIX,
          inventory_id: row.inventory_id,
          client_number_id: row.client_number_id,
          e164: maskE164(row.e164_number),
          current_sim_slot: row.sim_slot ? maskSlot(row.sim_slot) : null,
          current_gateway_id: row.gateway_id
            ? `${String(row.gateway_id).slice(0, 12)}…`
            : null,
          webhook_connected: row.webhook_connected,
          sales_status: row.sales_status,
          client_status: row.client_status,
        }
      : null,
    proposed: {
      sim_slot: TELSIM_SLOT ? maskSlot(TELSIM_SLOT) : null,
      gateway_id: GATEWAY_ID ? `${GATEWAY_ID.slice(0, 12)}…` : null,
      webhook_connected: true,
    },
    slot_physical_confirmed: slotPhysicalConfirmed,
    blockers,
    warnings,
    ready: blockers.length === 0,
  };

  console.log("VALIDATION", JSON.stringify(report, null, 2));

  if (!report.ready) {
    console.log("No se aplica binding — resolver blockers primero.");
    if (blockers.includes("slot_real_no_confirmado")) {
      console.log(
        "Slot real no confirmado: verificar físicamente en Skyline/Telsim, luego reintentar con SLOT_VERIFIED=true o tras inbound en ese slot.",
      );
    }
    await client.end();
    process.exit(blockers.includes("slot_real_no_confirmado") ? 0 : 1);
  }

  if (!APPLY) {
    console.log("Validación OK. Ejecutar con --apply para aplicar binding.");
    await client.end();
    return;
  }

  const e164 = row.e164_number;
  await client.query("BEGIN");
  try {
    const invUp = await client.query(
      `UPDATE real_number_inventory SET
         sim_slot = $2,
         gateway_id = $3,
         webhook_connected = true,
         metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
         updated_at = now()
       WHERE id = $1
         AND sales_status = 'active_assigned'
         AND current_company_id = $5`,
      [
        row.inventory_id,
        TELSIM_SLOT,
        GATEWAY_ID,
        JSON.stringify({
          telsim_binding_applied_at: new Date().toISOString(),
          telsim_binding_applied_by: "bind-telsim-slot-to-number",
          telsim_binding_suffix: NUMBER_SUFFIX,
        }),
        COMPANY_ID,
      ],
    );

    await client.query(
      `UPDATE client_numbers SET
         sim_slot = $2,
         gateway_id = $3,
         updated_at = now()
       WHERE id = $1 AND company_id = $4 AND status = 'active'`,
      [row.client_number_id, TELSIM_SLOT, GATEWAY_ID, COMPANY_ID],
    );

    await client.query(
      `INSERT INTO telsim_slot_bindings (slot_id, verify_phone, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (slot_id) DO UPDATE SET
         verify_phone = EXCLUDED.verify_phone,
         updated_at = now()`,
      [TELSIM_SLOT, e164],
    );

    await client.query("COMMIT");
    console.log(
      "APPLIED",
      JSON.stringify({
        suffix: NUMBER_SUFFIX,
        inventory_rows: invUp.rowCount,
        sim_slot: maskSlot(TELSIM_SLOT),
        gateway_id: `${GATEWAY_ID.slice(0, 12)}…`,
      }),
    );
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
