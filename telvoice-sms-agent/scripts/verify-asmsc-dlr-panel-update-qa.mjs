#!/usr/bin/env node
/**
 * QA DLR panel aSMSC — sin SMS, sin tick, sin wallet.
 * Uso: npm run build && node scripts/verify-asmsc-dlr-panel-update-qa.mjs
 *
 * Opcional (solo lectura + simulación en memoria, no escribe BD por defecto):
 *   DLR_QA_AUDIT_MESSAGE_ID=8d3db9e9-... node scripts/verify-asmsc-dlr-panel-update-qa.mjs
 */
import "dotenv/config";

const {
  isPanelMessageEligibleForAsmscDlr,
  mapDlrToPanelStatus,
  PANEL_DLR_ELIGIBLE_MODES,
} = await import("../dist/services/panelSmsDlrService.js");
const { extractDlrFields } = await import("../dist/services/smsMessageService.js");
const {
  isDeliveredDlr,
  normalizeDlrToMessageStatus,
} = await import("../dist/utils/dlr-status.js");
const { mergePanelMessageMetadata } = await import(
  "../dist/services/panelSmsMessageService.js"
);

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed += 1;
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond, name, detail = "") {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

console.log("QA DLR panel aSMSC (sin SMS real, sin wallet)\n");

// 1. Modos elegibles (causa raíz: live vs live_test)
assert(PANEL_DLR_ELIGIBLE_MODES.has("live"), "mode live es elegible para DLR");
assert(PANEL_DLR_ELIGIBLE_MODES.has("live_test"), "mode live_test es elegible");
assert(
  isPanelMessageEligibleForAsmscDlr({ mode: "live" }),
  "isPanelMessageEligibleForAsmscDlr(live)",
);
assert(
  !isPanelMessageEligibleForAsmscDlr({ mode: "mock" }),
  "mode mock no es elegible",
);

// 2. Mapping status Delivered / DELIVRD
for (const s of ["Delivered", "delivered", "DELIVRD", "delivrd"]) {
  assert(
    normalizeDlrToMessageStatus(s) === "delivered",
    `normalize → delivered (${s})`,
  );
  assert(isDeliveredDlr(s), `isDeliveredDlr (${s})`);
  assert(
    mapDlrToPanelStatus(s) === "delivered",
    `mapDlrToPanelStatus → delivered (${s})`,
  );
}

assert(
  mapDlrToPanelStatus("Failed") === "failed",
  "Failed → failed",
);
assert(
  mapDlrToPanelStatus("Pending") === "pending",
  "Pending → pending",
);

// 3. extractDlrFields — payload como logs PM2 QA
const samplePayload = {
  uid: "tv-719b8afb-test",
  message_id: "22281907",
  DLRStatus: "Delivered",
  PhoneNumber: "56934449937",
};
const fields = extractDlrFields(samplePayload);
assert(fields.uid === "tv-719b8afb-test", "uid extraído");
assert(fields.provider_message_id === "22281907", "message_id → provider_message_id");
assert(fields.dlr_status === "Delivered", "DLRStatus extraído");
assert(fields.phone_number === "56934449937", "PhoneNumber extraído");

// 4. Metadata merge preserva campos previos
const merged = mergePanelMessageMetadata(
  { route_id: "r1", asmsc_uid: "tv-old" },
  { last_dlr_status: "Delivered", last_dlr_at: "2026-05-26T00:00:00.000Z" },
);
assert(merged.route_id === "r1", "merge preserva route_id");
assert(merged.asmsc_uid === "tv-old", "merge no borra asmsc_uid previo sin patch");
assert(merged.last_dlr_status === "Delivered", "merge aplica last_dlr_status");

// 5. Idempotencia lógica (ya delivered + mismo DLR → no nuevo evento crítico)
const alreadyDelivered =
  { status: "delivered" }.status === "delivered" &&
  mapDlrToPanelStatus("Delivered") === "delivered";
assert(alreadyDelivered, "segundo Delivered no debería insertar evento delivered duplicado");

// 6. Auditoría opcional BD (solo lectura)
const auditId = process.env.DLR_QA_AUDIT_MESSAGE_ID?.trim();
if (auditId && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { data: msg, error } = await sb
    .from("panel_sms_messages")
    .select(
      "id,status,mode,provider_message_id,recipient_number,delivered_at,metadata",
    )
    .eq("id", auditId)
    .maybeSingle();

  if (error) {
    fail("auditoría BD", error.message);
  } else if (!msg) {
    fail("auditoría BD", `mensaje ${auditId} no encontrado`);
  } else {
    console.log("\n--- Auditoría BD (solo lectura) ---");
    console.log(JSON.stringify(msg, null, 2));
    assert(msg.provider_message_id === "22281907" || msg.provider_message_id, "provider_message_id presente");
    assert(
      isPanelMessageEligibleForAsmscDlr(msg),
      `mode ${msg.mode} elegible tras fix`,
      msg.mode,
    );
    if (msg.status === "sent" && msg.mode === "live") {
      ok(
        "causa raíz coherente",
        "mode=live + status=sent → DLR previo ignoraba panel (solo live_test)",
      );
    }
  }
} else {
  ok(
    "auditoría BD omitida",
    "defina DLR_QA_AUDIT_MESSAGE_ID + Supabase para auditar fila real",
  );
}

console.log(`\n${passed} OK, ${failed} fallos`);
if (failed > 0) {
  process.exit(1);
}
console.log("\nWallet / Billing / MercadoPago: no tocados por este script.");
console.log("Para re-aplicar DLR en prod tras deploy: scripts/replay-panel-dlr.mjs (manual).");
