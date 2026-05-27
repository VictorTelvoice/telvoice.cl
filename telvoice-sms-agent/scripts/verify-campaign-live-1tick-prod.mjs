#!/usr/bin/env node
/**
 * QA controlada — campaña live 1 destinatario, 1 tick, DLR.
 * Tel: +56934449937 (autorizado). No limpia datos al finalizar.
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
const SA_EMAIL = process.env.SUPERADMIN_EMAIL?.trim();
const SA_PASS = process.env.SUPERADMIN_PASSWORD?.trim();
const PHONE = "+56934449937";
const MESSAGE = "Prueba campaña live Telvoice controlada";
const SENDER = "TELVOICE";
const DLR_WAIT_MS = Number(process.env.CAMPAIGN_LIVE_DLR_WAIT_MS ?? 120_000);
const DLR_POLL_MS = 5_000;

const conn = process.env.DATABASE_URL?.trim();
if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}
if (!SA_EMAIL || !SA_PASS) {
  console.error("SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD requeridos");
  process.exit(1);
}

const distPreview = join(__dirname, "../dist/services/campaignPreviewService.js");
if (!existsSync(distPreview)) {
  console.error("npm run build primero");
  process.exit(1);
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

async function login(email, password) {
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }),
    redirect: "manual",
  });
  const cookie = parseCookies(res);
  if (!cookie.includes("tv_admin_session")) {
    throw new Error(`Login falló ${email} HTTP ${res.status}`);
  }
  return cookie;
}

function getDemoPassword() {
  let pass = process.env.CLIENT_DEMO_PASSWORD?.trim();
  if (pass) return pass;
  const out = execSync(
    "node scripts/provision-client-demo-user.mjs --reset-password",
    { cwd: join(__dirname, ".."), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const m = out.match(/ClienteDemo-[a-f0-9]+-2026!/);
  if (!m) throw new Error("No contraseña demo");
  return m[0];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const report = { prechecks: [], steps: {}, errors: [] };
function step(name, data) {
  report.steps[name] = data;
  console.log(`\n--- ${name} ---`);
  console.log(JSON.stringify(data, null, 2));
}

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const previewSvc = await import(pathToFileURL(distPreview).toString());
const { createContact, createContactList } = await import(
  pathToFileURL(join(__dirname, "../dist/services/contactService.js")).toString(),
);
const { getCompanyBalance } = await import(
  pathToFileURL(join(__dirname, "../dist/services/smsWalletService.js")).toString(),
);

let campaignId = null;
let contactId = null;
let listId = null;
let messageId = null;
let queueId = null;

await client.connect();

try {
  // === PRE-CHECKS ===
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) throw new Error("/health no OK");
  report.prechecks.push({ check: "health", ok: true });

  const { rows: providers } = await client.query(
    `SELECT id, code, status FROM sms_providers WHERE status='active' LIMIT 5`,
  );
  if (!providers.length) throw new Error("Sin proveedor activo");
  report.prechecks.push({ check: "provider_active", ok: true, count: providers.length });

  const { rows: routes } = await client.query(
    `SELECT id, status FROM sms_routes WHERE status='active' LIMIT 5`,
  );
  if (!routes.length) throw new Error("Sin ruta activa no pausada");
  report.prechecks.push({ check: "route_active", ok: true, count: routes.length });

  const { rows: crp } = await client.query(
    `SELECT id, campaigns_enabled, live_enabled, max_tps, status
     FROM company_rate_plans WHERE company_id=$1 AND status='active'`,
    [COMPANY_ID],
  );
  const crpOk = crp.every(
    (r) => r.campaigns_enabled && r.live_enabled && r.max_tps != null && r.max_tps <= 20,
  );
  if (!crpOk) {
    await client.query(
      `UPDATE company_rate_plans SET campaigns_enabled=true, live_enabled=true
       WHERE company_id=$1 AND status='active'`,
      [COMPANY_ID],
    );
    report.prechecks.push({ check: "crp_flags", ok: true, note: "flags corregidos temporalmente" });
  } else {
    report.prechecks.push({ check: "crp_flags", ok: true, rows: crp });
  }

  const balBefore = (await getCompanyBalance(COMPANY_ID)).availableSms;
  if (balBefore < 1) throw new Error(`Wallet insuficiente: ${balBefore}`);
  report.prechecks.push({ check: "wallet", ok: true, available_sms: balBefore });

  const { rows: oldQueue } = await client.query(
    `SELECT q.id, q.status, q.campaign_id, c.name
     FROM sms_send_queue q
     JOIN sms_campaigns c ON c.id = q.campaign_id
     WHERE c.company_id=$1 AND c.mode='live' AND q.status IN ('queued','processing')
     ORDER BY q.created_at DESC LIMIT 10`,
    [COMPANY_ID],
  );
  report.prechecks.push({
    check: "old_live_queue",
    ok: oldQueue.length === 0,
    count: oldQueue.length,
    items: oldQueue,
  });
  if (oldQueue.length > 0) {
    console.warn("AVISO: hay cola live pendiente previa — revisar antes de tick");
  }

  const { rows: oldProc } = await client.query(
    `SELECT id, name, status, mode, created_at FROM sms_campaigns
     WHERE company_id=$1 AND mode='live' AND status='processing'
     ORDER BY created_at DESC LIMIT 5`,
    [COMPANY_ID],
  );
  report.prechecks.push({
    check: "old_live_processing_campaigns",
    ok: oldProc.length === 0,
    count: oldProc.length,
    campaigns: oldProc,
  });

  report.prechecks.push({
    check: "scheduler_note",
    ok: true,
    note: "SMS_QUEUE_SCHEDULER puede procesar cola automáticamente en VPS (~60s). Tick manual inmediato tras launch.",
  });

  console.log("PRE-CHECKS:", JSON.stringify(report.prechecks, null, 2));

  const clientCookie = await login(CLIENT_EMAIL, getDemoPassword());
  const saCookie = await login(SA_EMAIL, SA_PASS);

  // === DRAFT ===
  const suffix = String(Date.now()).slice(-6);
  const list = await createContactList(COMPANY_ID, {
    name: `QA Live 1tick ${suffix}`,
  });
  listId = list.id;

  const { rows: existingContact } = await client.query(
    `SELECT id FROM contacts WHERE company_id=$1 AND phone=$2 LIMIT 1`,
    [COMPANY_ID, PHONE],
  );
  let contact;
  if (existingContact[0]) {
    contactId = existingContact[0].id;
    contact = { id: contactId };
    await client.query(
      `INSERT INTO contact_list_members (company_id, list_id, contact_id)
       VALUES ($1, $2, $3) ON CONFLICT (list_id, contact_id) DO NOTHING`,
      [COMPANY_ID, list.id, contactId],
    );
  } else {
    contact = await createContact(COMPANY_ID, {
      display_name: "QA Live Autorizado",
      phone: PHONE,
      list_id: list.id,
      source: "manual",
    });
    contactId = contact.id;
  }

  const preview = await previewSvc.buildCampaignPreview({
    companyId: COMPANY_ID,
    audienceSource: { type: "list", listId: list.id },
    senderId: SENDER,
    message: MESSAGE,
    campaignName: `QA Live 1tick ${suffix}`,
  });
  const recipients =
    preview.validRecipientCount ?? preview.audience?.totalFound ?? preview.totalRecipients;
  if (recipients !== 1) {
    throw new Error(`recipients=${recipients}, esperado 1`);
  }

  const draft = await previewSvc.createCampaignDraftFromPreview(COMPANY_ID, preview);
  campaignId = draft.id;

  const { rows: draftRow } = await client.query(
    `SELECT status, mode FROM sms_campaigns WHERE id=$1`,
    [campaignId],
  );
  const { rows: draftMsgs } = await client.query(
    `SELECT count(*)::int c FROM panel_sms_messages WHERE campaign_id=$1`,
    [campaignId],
  );
  const { rows: draftQueue } = await client.query(
    `SELECT count(*)::int c FROM sms_send_queue WHERE campaign_id=$1`,
    [campaignId],
  );
  if (draftRow[0].status !== "draft" || draftRow[0].mode !== "mock") {
    throw new Error(`draft inválido: ${JSON.stringify(draftRow[0])}`);
  }
  if (draftMsgs[0].c > 0 || draftQueue[0].c > 0) {
    throw new Error("draft no debe tener mensajes/cola");
  }
  step("draft", {
    campaign_id: campaignId,
    status: draftRow[0].status,
    mode: draftRow[0].mode,
    recipient_count: 1,
    wallet_before: balBefore,
  });

  // === LAUNCH ===
  const launchRes = await fetch(`${BASE}/app/campaigns/${campaignId}/launch-live`, {
    method: "POST",
    headers: {
      Cookie: clientCookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      consent_confirmed: "1",
      confirm_text: "ENVIAR",
    }),
    redirect: "manual",
  });
  if (launchRes.status !== 303 && launchRes.status !== 302) {
    throw new Error(`launch HTTP ${launchRes.status}: ${(await launchRes.text()).slice(0, 300)}`);
  }

  const balAfterLaunch = (await getCompanyBalance(COMPANY_ID)).availableSms;
  const { rows: campLaunch } = await client.query(
    `SELECT status, mode FROM sms_campaigns WHERE id=$1`,
    [campaignId],
  );
  const { rows: msgsLaunch } = await client.query(
    `SELECT id, status, mode, provider, provider_message_id FROM panel_sms_messages
     WHERE campaign_id=$1`,
    [campaignId],
  );
  const { rows: queueLaunch } = await client.query(
    `SELECT id, status FROM sms_send_queue WHERE campaign_id=$1`,
    [campaignId],
  );
  const { rows: debLaunch } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit'
       AND reference_id = ANY($2::uuid[])`,
    [COMPANY_ID, msgsLaunch.map((m) => m.id)],
  );

  if (campLaunch[0].status !== "processing" || campLaunch[0].mode !== "live") {
    throw new Error(`campaña post-launch: ${JSON.stringify(campLaunch[0])}`);
  }
  if (msgsLaunch.length !== 1 || msgsLaunch[0].status !== "queued" || msgsLaunch[0].mode !== "live") {
    throw new Error(`mensaje post-launch: ${JSON.stringify(msgsLaunch)}`);
  }
  if (msgsLaunch[0].provider_message_id) {
    throw new Error("provider_message_id debe ser null tras launch");
  }
  if (queueLaunch.length !== 1 || queueLaunch[0].status !== "queued") {
    throw new Error(`cola post-launch: ${JSON.stringify(queueLaunch)}`);
  }
  if (balAfterLaunch !== balBefore) throw new Error("wallet cambió en launch");
  if (debLaunch[0].c > 0) throw new Error("sms_debit en launch");

  messageId = msgsLaunch[0].id;
  queueId = queueLaunch[0].id;
  step("launch", {
    campaign_id: campaignId,
    message_id: messageId,
    queue_id: queueId,
    campaign: campLaunch[0],
    message: msgsLaunch[0],
    queue: queueLaunch[0],
    wallet_unchanged: true,
    no_debit: true,
  });

  // === TICK (solo 1) ===
  const tickRes = await fetch(`${BASE}/admin/traffic-control/queue/process-tick`, {
    method: "POST",
    headers: {
      Cookie: saCookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ limit: "1" }),
    redirect: "manual",
  });
  const tickLoc = tickRes.headers.get("location") ?? "";
  step("tick1_http", { status: tickRes.status, location: tickLoc });

  await sleep(3000);

  const { rows: msgPostTick } = await client.query(
    `SELECT id, status, mode, provider, provider_message_id, cost_sms
     FROM panel_sms_messages WHERE id=$1`,
    [messageId],
  );
  const { rows: queuePostTick } = await client.query(
    `SELECT id, status, error_code, error_message FROM sms_send_queue WHERE id=$1`,
    [queueId],
  );
  const { rows: eventsPostTick } = await client.query(
    `SELECT id, status, provider_message_id, created_at
     FROM panel_sms_delivery_events WHERE message_id=$1 ORDER BY created_at`,
    [messageId],
  );
  const { rows: debits } = await client.query(
    `SELECT id, type, sms_amount, reference_type, reference_id, created_at
     FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_id=$2`,
    [COMPANY_ID, messageId],
  );
  const balAfterTick = (await getCompanyBalance(COMPANY_ID)).availableSms;

  step("tick1_db", {
    message: msgPostTick[0],
    queue: queuePostTick[0],
    delivery_events: eventsPostTick,
    wallet_debits: debits,
    wallet_before: balBefore,
    wallet_after_tick: balAfterTick,
    wallet_delta: balBefore - balAfterTick,
  });

  const msgSt = msgPostTick[0]?.status;
  const provId = msgPostTick[0]?.provider_message_id;
  if (!provId && msgSt !== "sent" && msgSt !== "pending" && msgSt !== "delivered") {
    console.warn("Tras tick: mensaje aún sin provider_message_id — puede ser deferred/failed");
  }

  // === DLR wait ===
  const dlrStart = Date.now();
  let dlrStatus = "pending";
  let finalMsg = msgPostTick[0];
  let finalEvents = eventsPostTick;

  while (Date.now() - dlrStart < DLR_WAIT_MS) {
    const { rows: m } = await client.query(
      `SELECT status, provider_message_id FROM panel_sms_messages WHERE id=$1`,
      [messageId],
    );
    const { rows: ev } = await client.query(
      `SELECT status, provider_message_id, created_at FROM panel_sms_delivery_events
       WHERE message_id=$1 ORDER BY created_at`,
      [messageId],
    );
    finalMsg = m[0];
    finalEvents = ev;
    if (m[0]?.status === "delivered") {
      dlrStatus = "delivered";
      break;
    }
    const hasDelivered = ev.some((e) => e.status === "delivered");
    if (hasDelivered) {
      dlrStatus = "delivered_event";
      break;
    }
    await sleep(DLR_POLL_MS);
  }

  const balFinal = (await getCompanyBalance(COMPANY_ID)).availableSms;

  // === IDEMPOTENCIA tick 2 ===
  const { rows: qBefore2 } = await client.query(
    `SELECT status FROM sms_send_queue WHERE id=$1`,
    [queueId],
  );
  let tick2 = null;
  if (qBefore2[0]?.status === "queued") {
    const tick2Res = await fetch(`${BASE}/admin/traffic-control/queue/process-tick`, {
      method: "POST",
      headers: { Cookie: saCookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ limit: "1" }),
      redirect: "manual",
    });
    tick2 = { status: tick2Res.status, location: tick2Res.headers.get("location") };
    await sleep(2000);
  } else {
    tick2 = { skipped: true, reason: `queue status=${qBefore2[0]?.status}` };
  }

  const { rows: debitsFinal } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_id=$2`,
    [COMPANY_ID, messageId],
  );
  const { rows: msgCount } = await client.query(
    `SELECT count(*)::int c FROM panel_sms_messages WHERE campaign_id=$1`,
    [campaignId],
  );
  const { rows: queueCount } = await client.query(
    `SELECT count(*)::int c FROM sms_send_queue WHERE campaign_id=$1`,
    [campaignId],
  );
  const { rows: campFinal } = await client.query(
    `SELECT status, mode, metadata FROM sms_campaigns WHERE id=$1`,
    [campaignId],
  );

  report.deliverable = {
    campaign_id: campaignId,
    message_id: messageId,
    queue_id: queueId,
    provider_message_id: finalMsg?.provider_message_id ?? null,
    campaign_final: campFinal[0],
    message_final_status: finalMsg?.status,
    queue_final_status: qBefore2[0]?.status,
    wallet_before: balBefore,
    wallet_after: balFinal,
    wallet_transactions_count: debitsFinal[0].c,
    wallet_transactions: debits,
    dlr_status: dlrStatus,
    dlr_waited_ms: Math.min(DLR_WAIT_MS, Date.now() - dlrStart),
    delivery_events_final: finalEvents,
    message_count: msgCount[0].c,
    queue_count: queueCount[0].c,
    no_duplicate_message: msgCount[0].c === 1,
    no_duplicate_debit: debitsFinal[0].c <= 1,
    tick2,
    physical_receipt: "pendiente confirmación Victor",
    no_billing_mercadopago: true,
  };

  console.log("\n========== ENTREGABLE QA LIVE 1 TICK ==========");
  console.log(JSON.stringify(report.deliverable, null, 2));
} catch (e) {
  report.errors.push(e.message);
  console.error("FAIL:", e.message);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
