#!/usr/bin/env node
/**
 * Campaña productiva piloto Licantravel — crea audiencia, lanza y audita (sin limpiar datos).
 * Uso VPS: node scripts/licantravel-production-campaign-001.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPANY_ID = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const WALLET_ID = "6d873673-947b-4657-96f0-031d14db45fd";
const CAMPAIGN_NAME = "Producción Licantravel 001";
const SENDER_ID = "LICANTRAVEL";
const MESSAGE =
  process.env.LICANTRAVEL_CAMPAIGN_MESSAGE?.trim() ||
  "Prueba campaña productiva Telvoice — Licantravel. Gracias por tu preferencia.";
const LIST_NAME = "Audiencia Producción Licantravel 001";
const MAX_TPS = Number(process.env.LICANTRAVEL_CAMPAIGN_MAX_TPS ?? "2");
const POLL_MS = 10_000;
const MAX_WAIT_MS = Number(process.env.CAMPAIGN_COMPLETION_WAIT_MS ?? 900_000);

const conn = process.env.DATABASE_URL?.trim();
if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const distLaunch = join(__dirname, "../dist/services/campaignLiveLaunchService.js");
const distPreview = join(__dirname, "../dist/services/campaignPreviewService.js");
const distContact = join(__dirname, "../dist/services/contactService.js");
const distWallet = join(__dirname, "../dist/services/smsWalletService.js");
const distVerify = join(__dirname, "../dist/config/verifyNumbers.js");

if (
  !existsSync(distLaunch) ||
  !existsSync(distPreview) ||
  !existsSync(distContact)
) {
  console.error("Ejecuta npm run build en el agent primero");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function maskPhone(p) {
  const d = String(p).replace(/[^\d+]/g, "");
  if (d.length < 6) return "***";
  return d.slice(0, 4) + "****" + d.slice(-3);
}

function parseExtraPhones() {
  const raw = process.env.LICANTRAVEL_CAMPAIGN_PHONES ?? "";
  return raw
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const launchSvc = await import(pathToFileURL(distLaunch).toString());
const previewSvc = await import(pathToFileURL(distPreview).toString());
const { createContact, createContactList } = await import(
  pathToFileURL(distContact).toString(),
);
const { getCompanyBalance } = await import(pathToFileURL(distWallet).toString());

let verifyPhones = [];
if (existsSync(distVerify)) {
  const { parseVerifyNumbersFromEnv } = await import(
    pathToFileURL(distVerify).toString(),
  );
  verifyPhones = parseVerifyNumbersFromEnv(
    process.env.TELVOICE_VERIFY_NUMBERS ?? "",
  ).map((e) => e.phone);
}
const extra = parseExtraPhones();
const phoneSet = new Set([...verifyPhones, ...extra]);
const audiencePhones = [...phoneSet];

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const report = {
  phase: "licantravel_production_campaign_001",
  company_id: COMPANY_ID,
  wallet_id: WALLET_ID,
  errors: [],
};

async function precheck() {
  const healthPort = process.env.PORT || "3001";
  const health = await fetch(`http://127.0.0.1:${healthPort}/health`).then(
    (r) => ({ ok: r.ok, status: r.status }),
  );
  if (!health.ok) throw new Error(`/health no OK (${health.status})`);

  const { rows: crp } = await client.query(
    `SELECT traffic_type, live_enabled, campaigns_enabled, api_enabled, max_tps
     FROM company_rate_plans WHERE company_id=$1 AND status='active' AND country='CL'`,
    [COMPANY_ID],
  );
  const { rows: wallet } = await client.query(
    `SELECT available_sms, status FROM company_sms_wallets WHERE id=$1`,
    [WALLET_ID],
  );
  const { rows: queueG } = await client.query(
    `SELECT status, count(*)::int c FROM sms_send_queue
     WHERE status IN ('pending','queued','processing') GROUP BY status`,
  );
  const { rows: route } = await client.query(
    `SELECT r.name, r.status, p.code, p.status AS provider_status
     FROM sms_routes r JOIN sms_providers p ON p.id=r.provider_id
     WHERE r.name ILIKE '%Chile Default%' LIMIT 1`,
  );

  const blockers = [];
  if (wallet[0]?.status !== "active") blockers.push("wallet_not_active");
  if ((wallet[0]?.available_sms ?? 0) < 1) blockers.push("insufficient_balance");
  if (!crp.some((r) => r.campaigns_enabled)) blockers.push("campaigns_enabled_false");
  if (crp.some((r) => r.api_enabled)) blockers.push("api_enabled_true");
  if (route[0]?.status !== "active") blockers.push("route_not_active");
  if (route[0]?.provider_status !== "active") blockers.push("provider_not_active");

  report.precheck = {
    health,
    company_rate_plans: crp,
    wallet: wallet[0],
    queue_global_active: queueG,
    route: route[0] ?? null,
    SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST:
      process.env.SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST,
    SMS_PROVIDER_MODE: process.env.SMS_PROVIDER_MODE,
    audience_phones_masked: audiencePhones.map(maskPhone),
    audience_count: audiencePhones.length,
    blockers,
  };

  if (blockers.length) {
    throw new Error(`Precheck bloqueado: ${blockers.join(", ")}`);
  }
  if (audiencePhones.length < 1) {
    throw new Error("Sin números en audiencia (TELVOICE_VERIFY_NUMBERS vacío)");
  }
}

await client.connect();

try {
  console.log("=== Habilitar campañas Licantravel ===");
  const { rowCount } = await client.query(
    `UPDATE company_rate_plans
     SET campaigns_enabled = true,
         live_enabled = true,
         api_enabled = false,
         max_tps = $2,
         status = 'active'
     WHERE company_id = $1 AND country = 'CL' AND status = 'active'`,
    [COMPANY_ID, MAX_TPS],
  );
  report.campaigns_enabled_update = { rows: rowCount, max_tps: MAX_TPS };

  const balBefore = (await getCompanyBalance(COMPANY_ID)).availableSms;
  report.wallet_before = balBefore;

  await precheck();
  console.log("Precheck OK\n");

  console.log("=== Audiencia ===");
  const { rows: existingLists } = await client.query(
    `SELECT id, name FROM contact_lists WHERE company_id=$1 AND name=$2 LIMIT 1`,
    [COMPANY_ID, LIST_NAME],
  );
  const list =
    existingLists[0] ??
    (await createContactList(COMPANY_ID, { name: LIST_NAME }));
  report.list_id = list.id;
  report.list_reused = Boolean(existingLists[0]);

  const contactIds = [];
  for (const phone of audiencePhones) {
    const { rows: existing } = await client.query(
      `SELECT id FROM contacts WHERE company_id=$1 AND phone_normalized IS NOT NULL
       AND (phone=$2 OR phone_normalized=regexp_replace($2,'[^0-9+]','','g'))
       LIMIT 1`,
      [COMPANY_ID, phone],
    );
    let contactId;
    if (existing[0]) {
      contactId = existing[0].id;
    } else {
      const c = await createContact(COMPANY_ID, {
        display_name: `Prod ${maskPhone(phone)}`,
        phone,
        list_id: list.id,
        source: "manual",
      });
      contactId = c.id;
    }
    await client.query(
      `INSERT INTO contact_list_members (company_id, list_id, contact_id)
       VALUES ($1,$2,$3) ON CONFLICT (list_id, contact_id) DO NOTHING`,
      [COMPANY_ID, list.id, contactId],
    );
    contactIds.push(contactId);
  }
  report.contacts_linked = contactIds.length;

  console.log("=== Preview ===");
  const preview = await previewSvc.buildCampaignPreview({
    companyId: COMPANY_ID,
    audienceSource: { type: "list", listId: list.id },
    senderId: SENDER_ID,
    message: MESSAGE,
    campaignName: CAMPAIGN_NAME,
  });
  report.preview = {
    validRecipientCount: preview.validRecipientCount,
    segmentsPerMessage: preview.segmentsPerMessage,
    totalSmsEstimated: preview.totalSmsEstimated,
    balanceAvailable: preview.balanceAvailable,
    balanceAfter: preview.balanceAfter,
    canProceed: preview.canProceed,
    blockReason: preview.blockReason,
    senderId: SENDER_ID,
    messageLength: MESSAGE.length,
  };

  if (!preview.canProceed) {
    throw new Error(
      `Preview bloqueado: ${preview.blockReason ?? "canProceed=false"}`,
    );
  }
  if ((preview.validRecipientCount ?? 0) < 1) {
    throw new Error("Sin destinatarios válidos en preview");
  }

  const draft = await previewSvc.createCampaignDraftFromPreview(
    COMPANY_ID,
    preview,
  );
  report.campaign_id = draft.id;
  console.log("Draft:", draft.id);

  console.log("=== Launch ===");
  const launch = await launchSvc.launchLiveCampaign(COMPANY_ID, draft.id, {
    consentConfirmed: true,
    confirmText: launchSvc.LIVE_CAMPAIGN_CONFIRM_TEXT,
    launchedBy: "script:licantravel-production-campaign-001",
  });
  report.launch = launch;

  const waitStart = Date.now();
  let lastSnapshot = null;
  while (Date.now() - waitStart < MAX_WAIT_MS) {
    const { rows: camp } = await client.query(
      `SELECT status, mode, metadata, sent_at FROM sms_campaigns WHERE id=$1`,
      [draft.id],
    );
    const { rows: msgStats } = await client.query(
      `SELECT status, count(*)::int c FROM panel_sms_messages WHERE campaign_id=$1
       GROUP BY status`,
      [draft.id],
    );
    const { rows: queueStats } = await client.query(
      `SELECT status, count(*)::int c FROM sms_send_queue WHERE campaign_id=$1
       GROUP BY status`,
      [draft.id],
    );
    lastSnapshot = {
      elapsed_ms: Date.now() - waitStart,
      campaign: camp[0],
      messages: msgStats,
      queue: queueStats,
    };
    const st = camp[0]?.status;
    const queuedLeft = queueStats
      .filter((q) => ["queued", "processing", "pending"].includes(q.status))
      .reduce((a, q) => a + q.c, 0);
    if (
      (st === "sent" || st === "completed" || st === "failed") &&
      queuedLeft === 0
    ) {
      break;
    }
    await sleep(POLL_MS);
  }
  report.execution_wait = lastSnapshot;

  const { rows: messages } = await client.query(
    `SELECT id, recipient_number, status, provider, provider_message_id, sender_id,
            mode, cost_sms, error_code, error_message, delivered_at, created_at
     FROM panel_sms_messages WHERE campaign_id=$1 ORDER BY created_at`,
    [draft.id],
  );
  const { rows: queueRows } = await client.query(
    `SELECT id, status, attempts, error_code, error_message, message_id, updated_at
     FROM sms_send_queue WHERE campaign_id=$1 ORDER BY created_at`,
    [draft.id],
  );
  const msgIds = messages.map((m) => m.id);
  const { rows: debits } = await client.query(
    `SELECT id, sms_amount, reference_id, created_at FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit'
       AND reference_id = ANY($2::uuid[])`,
    [COMPANY_ID, msgIds.length ? msgIds : ["00000000-0000-0000-0000-000000000000"]],
  );
  const { rows: dlr } = await client.query(
    `SELECT e.message_id, e.status, e.provider_message_id, e.created_at
     FROM panel_sms_delivery_events e
     WHERE e.message_id = ANY($1::uuid[])
     ORDER BY e.created_at`,
    [msgIds.length ? msgIds : ["00000000-0000-0000-0000-000000000000"]],
  );
  const { rows: campFinal } = await client.query(
    `SELECT status, mode, metadata FROM sms_campaigns WHERE id=$1`,
    [draft.id],
  );

  const balAfter = (await getCompanyBalance(COMPANY_ID)).availableSms;
  const statusCounts = messages.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  report.deliverable = {
    campaigns_enabled: true,
    max_tps: MAX_TPS,
    SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST:
      process.env.SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST,
    campaign_id: draft.id,
    campaign_final: campFinal[0],
    recipients_loaded: audiencePhones.length,
    recipients_valid_preview: preview.validRecipientCount,
    messages_created: messages.length,
    messages_by_status: statusCounts,
    sent_count: statusCounts.sent ?? 0,
    delivered_count: statusCounts.delivered ?? 0,
    failed_count: statusCounts.failed ?? 0,
    provider_message_ids: messages
      .filter((m) => m.provider_message_id)
      .map((m) => ({
        message_id: m.id,
        recipient_masked: maskPhone(m.recipient_number),
        provider_message_id: m.provider_message_id,
      })),
    wallet_before: balBefore,
    wallet_after: balAfter,
    wallet_delta: balBefore - balAfter,
    wallet_debit_count: debits.length,
    wallet_transaction_ids: debits.map((d) => d.id),
    dlr_events: dlr,
    queue_final: queueRows,
    errors_in_queue: queueRows.filter((q) => q.status === "failed"),
    errors_in_messages: messages.filter((m) => m.status === "failed"),
    duplicate_debit_check: debits.length <= messages.filter((m) => m.cost_sms > 0).length,
    no_duplicate_messages_per_recipient:
      messages.length ===
      new Set(messages.map((m) => m.recipient_number)).size,
  };

  console.log("\n========== INFORME CAMPAÑA LICANTRAVEL ==========");
  console.log(JSON.stringify(report.deliverable, null, 2));
} catch (e) {
  report.errors.push(e instanceof Error ? e.message : String(e));
  console.error("FAIL:", e.message);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
