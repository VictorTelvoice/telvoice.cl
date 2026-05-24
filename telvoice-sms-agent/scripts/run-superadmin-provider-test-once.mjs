#!/usr/bin/env node
/**
 * Ejecuta una prueba técnica superadmin (1 SMS) — uso único controlado.
 * Uso: node scripts/run-superadmin-provider-test-once.mjs +56934449937
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const DEMO = "6cd1db92-d5c7-45e0-8548-df8907843350";
const PROVIDER_ID = "135cd8ef-aaac-4bd5-9fa6-7d4eb008ad8f";
const ROUTE_ID = "5b0e9ea4-efb0-4027-a72f-55ff6000f624";

const to = process.argv[2] ?? "";
const message = process.argv[3] ?? "Prueba real Telvoice Superadmin";
const senderId = process.argv[4] ?? "TELVOICE";

if (!to) {
  console.error("Uso: node scripts/run-superadmin-provider-test-once.mjs +569...");
  process.exit(1);
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function walletSms() {
  const { data } = await sb
    .from("company_sms_wallets")
    .select("available_sms")
    .eq("company_id", DEMO)
    .maybeSingle();
  return data?.available_sms ?? null;
}

const walletBefore = await walletSms();
console.log("wallet_before:", walletBefore);

const { sendSuperadminProviderTest } = await import(
  "../dist/services/superadminProviderTestService.js"
);
const { getSmsProviderById } = await import("../dist/services/smsProviderService.js");

const provider = await getSmsProviderById(PROVIDER_ID);
if (!provider) {
  console.error("Proveedor no encontrado");
  process.exit(1);
}

console.log("provider:", provider.code, provider.status);
console.log("route_id:", ROUTE_ID);
console.log("to:", to.replace(/\d(?=\d{4})/g, "*")); // mask middle digits in log
console.log("message_segments_check: use smsSegmentService");

const result = await sendSuperadminProviderTest({
  provider,
  routeId: ROUTE_ID,
  to,
  senderId,
  message,
});

console.log("\n=== RESULTADO ===");
console.log(JSON.stringify({
  accepted: result.accepted,
  messageId: result.messageId,
  providerMessageId: result.providerMessageId,
  status: result.status,
  errorMessage: result.errorMessage,
  rawResponseKeys: Object.keys(result.rawResponse ?? {}),
}, null, 2));

const walletAfter = await walletSms();
console.log("wallet_after:", walletAfter);

const { data: msg } = await sb
  .from("panel_sms_messages")
  .select(
    "id,status,mode,provider,provider_id,route_id,rate_plan_id,cost_sms,provider_message_id,metadata,created_at",
  )
  .eq("id", result.messageId)
  .single();

console.log("\n=== panel_sms_messages ===");
console.log(JSON.stringify(msg, null, 2));

const { data: txs } = await sb
  .from("wallet_transactions")
  .select("id,type,sms_amount,reference_id,created_at")
  .eq("company_id", DEMO)
  .eq("reference_id", result.messageId);

console.log("\n=== wallet_transactions (reference=message) ===");
console.log(JSON.stringify(txs ?? [], null, 2));

const { data: dlrs } = await sb
  .from("panel_sms_delivery_events")
  .select("id,status,provider_message_id,created_at")
  .eq("message_id", result.messageId)
  .order("created_at", { ascending: false });

console.log("\n=== panel_sms_delivery_events ===");
console.log(JSON.stringify(dlrs ?? [], null, 2));

const { count } = await sb
  .from("panel_sms_messages")
  .select("id", { count: "exact", head: true })
  .eq("metadata->>source", "superadmin_provider_test")
  .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

console.log("\n=== superadmin_provider_test últimos 5 min (count) ===", count);

process.exit(result.accepted ? 0 : 1);
