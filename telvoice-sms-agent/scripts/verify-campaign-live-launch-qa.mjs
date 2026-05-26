#!/usr/bin/env node
/**
 * QA Etapa 7 — launch live de campaña (cola, sin llamar proveedor desde launch).
 *
 * Uso: npm run build && node scripts/verify-campaign-live-launch-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const conn = process.env.DATABASE_URL?.trim();
const DEMO_COMPANY_ID =
  process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";

if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const distLaunch = join(__dirname, "../dist/services/campaignLiveLaunchService.js");
const distPreview = join(__dirname, "../dist/services/campaignPreviewService.js");
const distContact = join(__dirname, "../dist/services/contactService.js");
const distWallet = join(__dirname, "../dist/services/smsWalletService.js");

if (!existsSync(distLaunch) || !existsSync(distPreview)) {
  console.error("Ejecuta npm run build primero");
  process.exit(1);
}

const launchSvc = await import(pathToFileURL(distLaunch).toString());
const previewSvc = await import(pathToFileURL(distPreview).toString());
const { createContact, createContactList } = await import(
  pathToFileURL(distContact).toString(),
);
const { getCompanyBalance } = await import(
  pathToFileURL(distWallet).toString(),
);

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

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

function assert(cond, name, detail) {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

const suffix = String(Date.now()).slice(-7);
const phoneA = `+56988${suffix}`.slice(0, 12);
const cleanup = {
  campaignId: null,
  contactIds: [],
  listId: null,
  crpSnapshots: [],
  messageIds: [],
  queueIds: [],
};

async function snapshotCompanyRatePlans(companyId) {
  const { rows } = await client.query(
    `SELECT id, live_enabled, campaigns_enabled, max_tps, daily_limit
     FROM company_rate_plans WHERE company_id=$1 AND status='active'`,
    [companyId],
  );
  cleanup.crpSnapshots = rows.map((r) => ({ ...r }));
}

async function restoreCompanyRatePlans() {
  for (const row of cleanup.crpSnapshots) {
    await client.query(
      `UPDATE company_rate_plans
       SET live_enabled=$2, campaigns_enabled=$3, max_tps=$4, daily_limit=$5
       WHERE id=$1`,
      [
        row.id,
        row.live_enabled,
        row.campaigns_enabled,
        row.max_tps,
        row.daily_limit,
      ],
    );
  }
}

async function setCompanyFlags(companyId, live, campaigns) {
  await client.query(
    `UPDATE company_rate_plans
     SET live_enabled=$2, campaigns_enabled=$3
     WHERE company_id=$1 AND status='active'`,
    [companyId, live, campaigns],
  );
}

async function countWalletDebitsForCampaignMessages(companyId, campaignId) {
  const { rows: msgs } = await client.query(
    `SELECT id FROM panel_sms_messages WHERE campaign_id=$1 AND mode='live'`,
    [campaignId],
  );
  if (!msgs.length) return 0;
  const ids = msgs.map((r) => r.id);
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_type='sms_message'
       AND reference_id = ANY($2::uuid[])`,
    [companyId, ids],
  );
  return rows[0]?.n ?? 0;
}

await client.connect();

try {
  console.log("QA launch live campaña (sin proveedor en launch)\n");
  console.log("Empresa:", DEMO_COMPANY_ID.slice(0, 8) + "…\n");

  await snapshotCompanyRatePlans(DEMO_COMPANY_ID);

  const list = await createContactList(DEMO_COMPANY_ID, {
    name: `QA Live Launch ${suffix}`,
  });
  cleanup.listId = list.id;

  const c1 = await createContact(DEMO_COMPANY_ID, {
    display_name: "QA Live Launch",
    phone: phoneA,
    list_id: list.id,
    source: "manual",
  });
  cleanup.contactIds.push(c1.id);

  const preview = await previewSvc.buildCampaignPreview({
    companyId: DEMO_COMPANY_ID,
    audienceSource: { type: "list", listId: list.id },
    senderId: "TELVOICE",
    message: "Hola QA live launch etapa 7",
    campaignName: `QA Live Launch ${suffix}`,
  });

  const draft = await previewSvc.createCampaignDraftFromPreview(
    DEMO_COMPANY_ID,
    preview,
  );
  cleanup.campaignId = draft.id;
  ok("Campaña draft creada", draft.id.slice(0, 8));

  const walletBefore = (await getCompanyBalance(DEMO_COMPANY_ID)).availableSms;

  try {
    await launchSvc.launchLiveCampaign(DEMO_COMPANY_ID, draft.id, {
      consentConfirmed: false,
      confirmText: "NO",
    });
    fail("Launch sin confirmación", "debió fallar");
  } catch (err) {
    ok("Launch sin confirmación bloquea", err.message?.slice(0, 60));
  }

  await setCompanyFlags(DEMO_COMPANY_ID, false, false);
  try {
    await launchSvc.launchLiveCampaign(DEMO_COMPANY_ID, draft.id, {
      consentConfirmed: true,
      confirmText: launchSvc.LIVE_CAMPAIGN_CONFIRM_TEXT,
    });
    fail("Launch readiness false", "debió fallar");
  } catch (err) {
    ok("Readiness false bloquea launch", err.message?.slice(0, 60));
  }

  await setCompanyFlags(DEMO_COMPANY_ID, true, true);

  const result = await launchSvc.launchLiveCampaign(DEMO_COMPANY_ID, draft.id, {
    consentConfirmed: true,
    confirmText: launchSvc.LIVE_CAMPAIGN_CONFIRM_TEXT,
    launchedBy: null,
  });

  assert(result.status === "processing", "campaign.status=processing vía launch");
  assert(result.mode === "live", "campaign.mode=live");
  assert(result.messagesQueued >= 1, "mensajes encolados", String(result.messagesQueued));

  const { rows: camp } = await client.query(
    `SELECT status, mode, metadata FROM sms_campaigns WHERE id=$1`,
    [draft.id],
  );
  assert(camp[0]?.status === "processing", "BD campaign processing");
  assert(camp[0]?.mode === "live", "BD campaign mode live");
  assert(
    camp[0]?.metadata?.execution_mode === "live_campaign",
    "metadata.execution_mode",
  );
  assert(camp[0]?.metadata?.queue_created === true, "metadata.queue_created");

  const { rows: liveMsgs } = await client.query(
    `SELECT id, status, mode, provider_message_id, provider
     FROM panel_sms_messages WHERE campaign_id=$1 AND mode='live'`,
    [draft.id],
  );
  cleanup.messageIds = liveMsgs.map((r) => r.id);
  assert(liveMsgs.length >= 1, "panel_sms_messages mode=live");
  assert(
    liveMsgs.every((m) => m.status === "queued"),
    "mensajes status=queued",
  );
  assert(
    liveMsgs.every((m) => !m.provider_message_id),
    "sin provider_message_id en launch",
  );

  const { rows: queueRows } = await client.query(
    `SELECT id, status, message_id FROM sms_send_queue WHERE campaign_id=$1`,
    [draft.id],
  );
  cleanup.queueIds = queueRows.map((r) => r.id);
  assert(queueRows.length >= 1, "sms_send_queue items");
  assert(
    queueRows.every((q) => q.status === "queued"),
    "queue status=queued",
  );

  const walletAfter = (await getCompanyBalance(DEMO_COMPANY_ID)).availableSms;
  assert(walletAfter === walletBefore, "wallet sin cambios en launch");

  const debits = await countWalletDebitsForCampaignMessages(
    DEMO_COMPANY_ID,
    draft.id,
  );
  assert(debits === 0, "sin wallet_transactions sms_debit");

  try {
    await launchSvc.launchLiveCampaign(DEMO_COMPANY_ID, draft.id, {
      consentConfirmed: true,
      confirmText: launchSvc.LIVE_CAMPAIGN_CONFIRM_TEXT,
    });
    fail("Segunda ejecución launch", "debió bloquear");
  } catch (err) {
    ok("Idempotencia launch", err.message?.slice(0, 70));
  }

  const { rows: dupMsgs } = await client.query(
    `SELECT COUNT(*)::int AS n FROM panel_sms_messages WHERE campaign_id=$1 AND mode='live'`,
    [draft.id],
  );
  assert(dupMsgs[0]?.n === liveMsgs.length, "sin mensajes live duplicados");

  const { rows: dupQueue } = await client.query(
    `SELECT COUNT(*)::int AS n FROM sms_send_queue WHERE campaign_id=$1`,
    [draft.id],
  );
  assert(dupQueue[0]?.n === queueRows.length, "sin cola duplicada");

  ok("Launch no llama proveedor", "solo queued + cola");
  ok("Billing/MercadoPago", "sin cambios en este script");
} catch (err) {
  fail("QA launch live", err instanceof Error ? err.message : String(err));
} finally {
  await restoreCompanyRatePlans();
  if (cleanup.queueIds.length) {
    await client.query(`DELETE FROM sms_send_queue WHERE campaign_id=$1`, [
      cleanup.campaignId,
    ]);
  }
  if (cleanup.messageIds.length) {
    await client.query(`DELETE FROM panel_sms_messages WHERE campaign_id=$1`, [
      cleanup.campaignId,
    ]);
  }
  if (cleanup.campaignId) {
    await client.query(`DELETE FROM sms_campaigns WHERE id=$1`, [
      cleanup.campaignId,
    ]);
  }
  for (const id of cleanup.contactIds) {
    await client.query(`DELETE FROM contacts WHERE id=$1`, [id]);
  }
  if (cleanup.listId) {
    await client.query(`DELETE FROM contact_lists WHERE id=$1`, [cleanup.listId]);
  }
  await client.end();
}

console.log(`\nResultado: ${passed} OK, ${failed} fallos`);
process.exit(failed > 0 ? 1 : 0);
