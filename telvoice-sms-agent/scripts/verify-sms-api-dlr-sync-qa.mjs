#!/usr/bin/env node
/**
 * QA/backfill DLR API → sms_api_messages sin SMS real.
 *
 * Uso:
 *   npm run build && node scripts/verify-sms-api-dlr-sync-qa.mjs
 *
 * Backfill controlado (requiere DATABASE_URL):
 *   SMS_API_DLR_SYNC_APPLY=1 SMS_API_DLR_SYNC_PROVIDER_MESSAGE_ID=22552336 \
 *     node scripts/verify-sms-api-dlr-sync-qa.mjs
 *
 * Caso real Licantravel QA:
 *   message_id baa48027-b829-407a-918c-5dbc9651a80e
 *   provider_message_id 22552336
 */
import "dotenv/config";
import pg from "pg";

const {
  mapDlrToSmsApiMessageState,
  shouldApplySmsApiDlrUpdate,
  syncSmsApiMessageFromDlrEvent,
} = await import("../dist/services/smsApiDlrSyncService.js");

const REFERENCE_MESSAGE_ID = "baa48027-b829-407a-918c-5dbc9651a80e";
const REFERENCE_PROVIDER_MESSAGE_ID = "22552336";
const LICAN_COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";

const deliveredFixture = {
  providerMessageId: REFERENCE_PROVIDER_MESSAGE_ID,
  uid: "tv-db7f3f59-3a68-494d-8cf3-1321ed291e97",
  dlrStatus: "Delivered",
  errorCode: "0",
  errorDescription: "ASMSC_OK",
  rawPayload: {
    message_id: Number(REFERENCE_PROVIDER_MESSAGE_ID),
    DLRStatus: "Delivered",
    ErrorCode: 0,
    ErrorDescription: "ASMSC_OK",
    PhoneNumber: "56934449937",
  },
  receivedAt: "2026-06-16T19:48:24.741Z",
};

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

console.log("QA sms-api-dlr-sync (fixture, sin SMS real)\n");

const mapped = mapDlrToSmsApiMessageState(deliveredFixture.dlrStatus);
assert(mapped.status === "delivered", "fixture Delivered → delivered");
assert(mapped.dlrStatus === "delivered", "fixture dlr_status delivered");

const noDegrade = shouldApplySmsApiDlrUpdate(
  { status: "delivered", dlr_status: "delivered" },
  mapDlrToSmsApiMessageState("Pending"),
);
assert(!noDegrade.apply, "pending no degrada delivered", noDegrade.reason);

const failedMap = mapDlrToSmsApiMessageState("Failed");
assert(failedMap.status === "failed", "Failed → failed status");

const unknown = await syncSmsApiMessageFromDlrEvent({
  providerMessageId: "99999999999",
  dlrStatus: "Delivered",
});
assert(unknown.outcome === "skipped", "provider desconocido skipped", unknown.reason);
assert(unknown.reason === "api_message_not_found", "reason api_message_not_found");

if (process.env.SMS_API_DLR_SYNC_APPLY === "1") {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    fail("SMS_API_DLR_SYNC_APPLY requiere DATABASE_URL");
  } else {
    const providerId =
      process.env.SMS_API_DLR_SYNC_PROVIDER_MESSAGE_ID ??
      REFERENCE_PROVIDER_MESSAGE_ID;

    const client = new pg.Client({
      connectionString: conn,
      ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();

    const beforeWallet = await client.query(
      `select available_sms from company_sms_wallets where company_id=$1`,
      [LICAN_COMPANY_ID],
    );
    const beforeMsg = await client.query(
      `select id, status, dlr_status from sms_api_messages where id=$1`,
      [REFERENCE_MESSAGE_ID],
    );
    const beforeTxCount = await client.query(
      `select count(*)::int c from wallet_transactions where company_id=$1`,
      [LICAN_COMPANY_ID],
    );

    console.log("\n--- Backfill controlado (solo lectura previa) ---");
    console.log(
      JSON.stringify(
        {
          wallet_before: beforeWallet.rows[0]?.available_sms,
          message_before: beforeMsg.rows[0],
          wallet_transactions: beforeTxCount.rows[0]?.c,
        },
        null,
        2,
      ),
    );

    const result = await syncSmsApiMessageFromDlrEvent({
      ...deliveredFixture,
      providerMessageId: providerId,
    });

    const afterMsg = await client.query(
      `select id, status, dlr_status, metadata from sms_api_messages where id=$1`,
      [REFERENCE_MESSAGE_ID],
    );
    const afterWallet = await client.query(
      `select available_sms from company_sms_wallets where company_id=$1`,
      [LICAN_COMPANY_ID],
    );
    const afterTxCount = await client.query(
      `select count(*)::int c from wallet_transactions where company_id=$1`,
      [LICAN_COMPANY_ID],
    );

    await client.end();

    console.log("\n--- Resultado sync ---");
    console.log(JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify(
        {
          message_after: {
            id: afterMsg.rows[0]?.id,
            status: afterMsg.rows[0]?.status,
            dlr_status: afterMsg.rows[0]?.dlr_status,
            error_code: afterMsg.rows[0]?.metadata?.error_code ?? afterMsg.rows[0]?.metadata?.last_dlr_error_code,
            dlr_delivered_at: afterMsg.rows[0]?.metadata?.dlr_delivered_at,
          },
          wallet_after: afterWallet.rows[0]?.available_sms,
          wallet_transactions: afterTxCount.rows[0]?.c,
        },
        null,
        2,
      ),
    );

    assert(
      result.outcome === "matched" || result.reason === "idempotent_duplicate",
      "sync aplicado o idempotente",
      `${result.outcome}/${result.reason}`,
    );
    assert(
      afterWallet.rows[0]?.available_sms === beforeWallet.rows[0]?.available_sms,
      "wallet sin cambios",
    );
    assert(
      afterTxCount.rows[0]?.c === beforeTxCount.rows[0]?.c,
      "wallet_transactions sin nuevos débitos",
    );
    if (result.outcome === "matched") {
      assert(afterMsg.rows[0]?.dlr_status === "delivered", "dlr_status=delivered");
      assert(afterMsg.rows[0]?.status === "delivered", "status=delivered");
    }
  }
} else {
  ok("backfill producción omitido (SMS_API_DLR_SYNC_APPLY≠1)");
}

console.log(`\nResumen: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
