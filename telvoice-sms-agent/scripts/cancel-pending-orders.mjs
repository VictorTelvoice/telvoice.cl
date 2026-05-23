#!/usr/bin/env node
/**
 * Cancela órdenes SMS con payment_status=pending (no borra filas).
 *
 * Uso:
 *   node scripts/cancel-pending-orders.mjs --ids=uuid1,uuid2
 *   node scripts/cancel-pending-orders.mjs --ids=uuid1 --confirm
 *
 * Sin --confirm solo muestra qué haría (dry-run).
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env del agente.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const idsArg = argv.find((a) => a.startsWith("--ids="));
  const confirm = argv.includes("--confirm");
  const ids = idsArg
    ? idsArg
        .slice("--ids=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return { ids, confirm };
}

const { ids, confirm } = parseArgs(process.argv.slice(2));

if (!ids.length) {
  console.error("Indica --ids=orden1,orden2");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const sb = createClient(url, key);

for (const orderId of ids) {
  const { data: order, error } = await sb
    .from("sms_orders")
    .select("id,payment_status,credit_status,payment_reference")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error(orderId, "error lectura:", error.message);
    continue;
  }
  if (!order) {
    console.warn(orderId, "no encontrada");
    continue;
  }
  if (order.payment_status !== "pending") {
    console.warn(orderId, "omitida: payment_status =", order.payment_status);
    continue;
  }
  if (order.credit_status === "credited") {
    console.warn(orderId, "omitida: ya acreditada");
    continue;
  }

  console.log(
    confirm ? "CANCELAR" : "DRY-RUN cancelaría",
    orderId,
    "ref:",
    order.payment_reference ?? "—",
  );

  if (!confirm) {
    continue;
  }

  const cancelledAt = new Date().toISOString();
  const { data: current } = await sb
    .from("sms_orders")
    .select("metadata")
    .eq("id", orderId)
    .single();

  const { error: updErr } = await sb
    .from("sms_orders")
    .update({
      payment_status: "cancelled",
      metadata: {
        ...(current?.metadata ?? {}),
        cancelled_by: "superadmin",
        cancelled_at: cancelledAt,
        cancel_source: "script",
      },
    })
    .eq("id", orderId);

  if (updErr) {
    console.error(orderId, "error update:", updErr.message);
  } else {
    console.log(orderId, "cancelada OK");
  }
}

if (!confirm) {
  console.log("\nDry-run. Repite con --confirm para aplicar cambios.");
}
