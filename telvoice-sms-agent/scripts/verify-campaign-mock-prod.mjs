#!/usr/bin/env node
/**
 * QA post-deploy Etapa 5 — ejecución mock campaña (HTTP + DB).
 * No SMS real. Requiere DATABASE_URL; genera contraseña demo si falta CLIENT_DEMO_PASSWORD.
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
const distExecute = join(__dirname, "../dist/services/campaignMockExecuteService.js");
const distContact = join(__dirname, "../dist/services/contactService.js");
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
const executeSvc = await import(pathToFileURL(distExecute).toString());
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

const suffix = String(Date.now()).slice(-6);
const phone = `+56955${suffix}`.slice(0, 12);
let campaignId = null;
let contactId = null;
let listId = null;

await client.connect();
try {
  const password = getDemoPassword();
  const cookie = await login(password);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) throw new Error("/health no OK");

  const routes = [
    "/app/campaigns",
    "/app/campaigns/new",
    "/app/contacts",
    "/app/reports",
    "/app/wallet",
    "/app/send-sms",
    "/app/buy-sms",
    "/app/invoices",
    "/admin/campaigns",
    "/admin/messages",
  ];
  for (const r of routes) {
    const { status } = await get(r, cookie);
    if (status !== 200) throw new Error(`${r} HTTP ${status}`);
  }
  console.log("Regresión rutas: OK (10)");

  const list = await createContactList(COMPANY_ID, {
    name: `QA Prod Mock ${suffix}`,
  });
  listId = list.id;
  const contact = await createContact(COMPANY_ID, {
    display_name: "QA Prod Mock",
    phone,
    list_id: list.id,
    source: "manual",
  });
  contactId = contact.id;

  const preview = await previewSvc.buildCampaignPreview({
    companyId: COMPANY_ID,
    audienceSource: { type: "list", listId: list.id },
    senderId: "TELVOICE",
    message: "QA post-deploy mock campaña",
    campaignName: `QA Prod Mock ${suffix}`,
  });

  const draft = await previewSvc.createCampaignDraftFromPreview(
    COMPANY_ID,
    preview,
  );
  campaignId = draft.id;

  const campaignsPage = await get("/app/campaigns", cookie);
  if (!campaignsPage.html.includes("Simular envío")) {
    throw new Error('UI: falta botón "Simular envío" en /app/campaigns');
  }
  if (!campaignsPage.html.includes(campaignId.slice(0, 8))) {
    throw new Error("UI: borrador no visible en listado");
  }
  console.log('UI: botón "Simular envío" presente (borrador mock)');

  const balBefore = (await getCompanyBalance(COMPANY_ID)).availableSms;

  const execRes = await fetch(
    `${BASE}/app/campaigns/${campaignId}/execute-mock`,
    {
      method: "POST",
      headers: { Cookie: cookie },
      redirect: "manual",
    },
  );
  if (execRes.status !== 303 && execRes.status !== 302) {
    throw new Error(`execute-mock HTTP ${execRes.status}`);
  }

  const { rows: camp } = await client.query(
    `SELECT status, mode, real_sms_cost, valid_recipients, metadata FROM sms_campaigns WHERE id=$1`,
    [campaignId],
  );
  const c = camp[0];
  if (c.status !== "completed") throw new Error(`campaign status=${c.status}`);
  if (c.mode !== "mock") throw new Error("campaign mode != mock");

  const { rows: msgs } = await client.query(
    `SELECT count(*)::int c FROM panel_sms_messages WHERE campaign_id=$1`,
    [campaignId],
  );
  const msgCount = msgs[0].c;
  if (msgCount < 1) throw new Error("sin mensajes");

  const { rows: msgCheck } = await client.query(
    `SELECT mode, provider, status FROM panel_sms_messages WHERE campaign_id=$1`,
    [campaignId],
  );
  for (const m of msgCheck) {
    if (m.mode !== "mock" || m.provider !== "mock" || m.status !== "delivered") {
      throw new Error("mensaje no mock/delivered");
    }
  }

  const { rows: debits } = await client.query(
    `SELECT type, reference_type, reference_id, sms_amount, metadata, description
     FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_type='sms_campaign' AND reference_id=$2`,
    [COMPANY_ID, campaignId],
  );
  if (debits.length !== 1) throw new Error(`debits=${debits.length}`);
  const d = debits[0];
  if (d.sms_amount !== c.real_sms_cost) throw new Error("sms_amount mismatch");

  const { rows: msgDebits } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions wt
     JOIN panel_sms_messages m ON m.id=wt.reference_id
     WHERE m.campaign_id=$1 AND wt.reference_type='sms_message'`,
    [campaignId],
  );
  if (msgDebits[0].c > 0) throw new Error("hay débitos sms_message");

  const balAfter1 = (await getCompanyBalance(COMPANY_ID)).availableSms;
  if (balBefore - balAfter1 !== c.real_sms_cost) {
    throw new Error("saldo no coincide con real_sms_cost");
  }

  const second = await executeSvc.executeContactsAudienceCampaignMock({
    companyId: COMPANY_ID,
    campaignId,
  });
  if (!second.alreadyExecuted) throw new Error("2da ejecución sin alreadyExecuted");

  const balAfter2 = (await getCompanyBalance(COMPANY_ID)).availableSms;
  if (balAfter2 !== balAfter1) throw new Error("2da ejecución descontó saldo");

  const { rows: debits2 } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_type='sms_campaign' AND reference_id=$2`,
    [COMPANY_ID, campaignId],
  );
  if (debits2[0].c !== 1) throw new Error("2do débito creado");

  const { rows: msgs2 } = await client.query(
    `SELECT count(*)::int c FROM panel_sms_messages WHERE campaign_id=$1`,
    [campaignId],
  );
  if (msgs2[0].c !== msgCount) throw new Error("mensajes duplicados");

  console.log("\n=== POST-DEPLOY OK ===");
  console.log(JSON.stringify({
    campaign_id: campaignId,
    recipients: c.valid_recipients,
    panel_sms_messages: msgCount,
    campaign_status: c.status,
    campaign_mode: c.mode,
    wallet_debit: {
      type: d.type,
      reference_type: d.reference_type,
      reference_id: d.reference_id,
      sms_amount: d.sms_amount,
      metadata_source: d.metadata?.source,
    },
    balance_debited_once: true,
    second_execution_idempotent: true,
    no_live_sms: true,
  }, null, 2));
} catch (e) {
  console.error("POST-DEPLOY FAIL:", e.message);
  process.exit(1);
} finally {
  if (campaignId) {
    await client.query(
      `DELETE FROM panel_sms_delivery_events WHERE message_id IN (
         SELECT id FROM panel_sms_messages WHERE campaign_id=$1)`,
      [campaignId],
    );
    await client.query(
      `DELETE FROM wallet_transactions WHERE reference_type='sms_campaign' AND reference_id=$1`,
      [campaignId],
    );
    await client.query(
      `DELETE FROM panel_sms_messages WHERE campaign_id=$1`,
      [campaignId],
    );
    await client.query(`DELETE FROM sms_campaigns WHERE id=$1`, [campaignId]);
  }
  if (listId) {
    await client.query(`DELETE FROM contact_list_members WHERE list_id=$1`, [
      listId,
    ]);
    await client.query(`DELETE FROM contact_lists WHERE id=$1`, [listId]);
  }
  if (contactId) {
    await client.query(`DELETE FROM contacts WHERE id=$1`, [contactId]);
  }
  await client.end();
}
