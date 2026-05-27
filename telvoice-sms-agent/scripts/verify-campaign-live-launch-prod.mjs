#!/usr/bin/env node
/**
 * QA post-deploy Etapa 7 — launch live sin tick (HTTP + DB).
 * No ejecuta process tick. Limpia cola al finalizar para evitar envío automático.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(
  /\/$/,
  "",
);
const COMPANY_ID = "6cd1db92-d5c7-45e0-8548-df8907843350";
const CLIENT_EMAIL = "cliente.demo@telvoice.cl";

const conn = process.env.DATABASE_URL?.trim();
if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const distPreview = join(__dirname, "../dist/services/campaignPreviewService.js");
const distWallet = join(__dirname, "../dist/services/smsWalletService.js");
if (!existsSync(distPreview)) {
  console.error("Ejecuta npm run build primero");
  process.exit(1);
}

function getDemoPassword() {
  let pass = process.env.CLIENT_DEMO_PASSWORD?.trim();
  if (pass) return pass;
  const out = execSync(
    "node scripts/provision-client-demo-user.mjs --reset-password",
    { cwd: join(__dirname, ".."), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const m = out.match(/ClienteDemo-[a-f0-9]+-2026!/);
  if (!m) throw new Error("No se pudo obtener contraseña demo");
  return m[0];
}

function parseCookies(res) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return raw
    .flatMap((c) => (Array.isArray(c) ? c : [c]))
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function login(password) {
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: CLIENT_EMAIL, password }),
    redirect: "manual",
  });
  const cookie = parseCookies(res);
  if (!cookie.includes("tv_admin_session")) {
    throw new Error(`Login falló HTTP ${res.status}`);
  }
  return cookie;
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    redirect: "follow",
  });
  return { status: res.status, html: await res.text() };
}

const previewSvc = await import(pathToFileURL(distPreview).toString());
const { createContact, createContactList } = await import(
  pathToFileURL(join(__dirname, "../dist/services/contactService.js")).toString(),
);
const { getCompanyBalance } = await import(
  pathToFileURL(distWallet).toString(),
);

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const suffix = String(Date.now()).slice(-6);
const phone = `+56944${suffix}`.slice(0, 12);
let campaignId = null;
let contactId = null;
let listId = null;
let messageId = null;
let queueId = null;
const crpSnapshots = [];

await client.connect();

async function snapshotFlags() {
  const { rows } = await client.query(
    `SELECT id, live_enabled, campaigns_enabled FROM company_rate_plans
     WHERE company_id=$1 AND status='active'`,
    [COMPANY_ID],
  );
  crpSnapshots.push(...rows.map((r) => ({ ...r })));
}

async function restoreFlags() {
  for (const row of crpSnapshots) {
    await client.query(
      `UPDATE company_rate_plans SET live_enabled=$2, campaigns_enabled=$3 WHERE id=$1`,
      [row.id, row.live_enabled, row.campaigns_enabled],
    );
  }
}

try {
  await snapshotFlags();
  await client.query(
    `UPDATE company_rate_plans SET live_enabled=true, campaigns_enabled=true
     WHERE company_id=$1 AND status='active'`,
    [COMPANY_ID],
  );

  const password = getDemoPassword();
  const cookie = await login(password);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) throw new Error("/health no OK");
  console.log("/health OK");

  const list = await createContactList(COMPANY_ID, {
    name: `QA Prod Live Launch ${suffix}`,
  });
  listId = list.id;
  const contact = await createContact(COMPANY_ID, {
    display_name: "QA Prod Live Launch",
    phone,
    list_id: list.id,
    source: "manual",
  });
  contactId = contact.id;

  const preview = await previewSvc.buildCampaignPreview({
    companyId: COMPANY_ID,
    audienceSource: { type: "list", listId: list.id },
    senderId: "TELVOICE",
    message: "QA post-deploy live launch etapa 7",
    campaignName: `QA Prod Live ${suffix}`,
  });

  const draft = await previewSvc.createCampaignDraftFromPreview(
    COMPANY_ID,
    preview,
  );
  campaignId = draft.id;
  console.log("campaign_id (draft):", campaignId);

  const detailBefore = await get(`/app/campaigns/${campaignId}`, cookie);
  if (detailBefore.status !== 200) {
    throw new Error(`Detalle HTTP ${detailBefore.status}`);
  }
  for (const must of [
    "Preparación para envío real",
    "Enviar campaña real",
    "launch-live",
    "ENVIAR",
  ]) {
    if (!detailBefore.html.includes(must)) {
      throw new Error(`UI detalle: falta "${must}"`);
    }
  }
  console.log("UI: bloques readiness + launch presentes");

  const balBefore = (await getCompanyBalance(COMPANY_ID)).availableSms;

  const launchRes = await fetch(
    `${BASE}/app/campaigns/${campaignId}/launch-live`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        consent_confirmed: "1",
        confirm_text: "ENVIAR",
      }),
      redirect: "manual",
    },
  );
  if (launchRes.status !== 303 && launchRes.status !== 302) {
    const body = await launchRes.text();
    throw new Error(`launch-live HTTP ${launchRes.status}: ${body.slice(0, 200)}`);
  }
  console.log("HTTP launch-live: redirect OK");

  const { rows: camp } = await client.query(
    `SELECT status, mode, metadata FROM sms_campaigns WHERE id=$1`,
    [campaignId],
  );
  const c = camp[0];
  if (c.status !== "processing") throw new Error(`status=${c.status}`);
  if (c.mode !== "live") throw new Error(`mode=${c.mode}`);

  const { rows: msgs } = await client.query(
    `SELECT id, status, mode, provider_message_id FROM panel_sms_messages
     WHERE campaign_id=$1 AND mode='live'`,
    [campaignId],
  );
  if (msgs.length !== 1) throw new Error(`live messages=${msgs.length}`);
  messageId = msgs[0].id;
  if (msgs[0].status !== "queued") throw new Error(`msg status=${msgs[0].status}`);
  if (msgs[0].provider_message_id) {
    throw new Error("provider_message_id debe ser null sin tick");
  }

  const { rows: queue } = await client.query(
    `SELECT id, status FROM sms_send_queue WHERE campaign_id=$1`,
    [campaignId],
  );
  if (queue.length !== 1) throw new Error(`queue items=${queue.length}`);
  queueId = queue[0].id;
  if (queue[0].status !== "queued") throw new Error(`queue status=${queue[0].status}`);

  const balAfter = (await getCompanyBalance(COMPANY_ID)).availableSms;
  if (balAfter !== balBefore) throw new Error("wallet cambió en launch");

  const { rows: debits } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_id=$2`,
    [COMPANY_ID, messageId],
  );
  if (debits[0].c > 0) throw new Error("hay sms_debit tras launch");

  const second = await fetch(`${BASE}/app/campaigns/${campaignId}/launch-live`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      consent_confirmed: "1",
      confirm_text: "ENVIAR",
    }),
    redirect: "manual",
  });
  if (second.status === 303 || second.status === 302) {
    const loc = second.headers.get("location") ?? "";
    if (!loc.includes("error=")) {
      throw new Error("2do launch no bloqueado");
    }
  }
  console.log("Idempotencia: 2do launch bloqueado");

  const detailAfter = await get(`/app/campaigns/${campaignId}`, cookie);
  if (!detailAfter.html.includes("Estado de cola y envío")) {
    throw new Error("UI: falta bloque cola post-launch");
  }

  console.log("\n=== POST-DEPLOY LIVE LAUNCH OK (sin tick) ===");
  console.log(
    JSON.stringify(
      {
        campaign_id: campaignId,
        message_id: messageId,
        queue_id: queueId,
        campaign_status: c.status,
        campaign_mode: c.mode,
        message_status: msgs[0].status,
        queue_status: queue[0].status,
        provider_message_id: null,
        wallet_unchanged: true,
        no_sms_debit: true,
        no_tick: true,
        no_dlr: true,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("POST-DEPLOY FAIL:", e.message);
  process.exit(1);
} finally {
  if (campaignId) {
    await client.query(`DELETE FROM sms_send_queue WHERE campaign_id=$1`, [
      campaignId,
    ]);
    await client.query(
      `DELETE FROM panel_sms_delivery_events WHERE message_id IN (
         SELECT id FROM panel_sms_messages WHERE campaign_id=$1)`,
      [campaignId],
    );
    await client.query(
      `DELETE FROM wallet_transactions WHERE reference_id IN (
         SELECT id FROM panel_sms_messages WHERE campaign_id=$1)`,
      [campaignId],
    );
    await client.query(`DELETE FROM panel_sms_messages WHERE campaign_id=$1`, [
      campaignId,
    ]);
    await client.query(`DELETE FROM sms_campaigns WHERE id=$1`, [campaignId]);
  }
  if (contactId) {
    await client.query(`DELETE FROM contacts WHERE id=$1`, [contactId]);
  }
  if (listId) {
    await client.query(`DELETE FROM contact_lists WHERE id=$1`, [listId]);
  }
  await restoreFlags();
  await client.end();
}
