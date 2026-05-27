#!/usr/bin/env node
/**
 * QA live controlada — 1 destinatario, 1 launch, 1 tick manual, scheduler OFF.
 * No limpia datos. No reactiva scheduler.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (
  process.env.CAMPAIGN_QA_BASE_URL ||
  (process.env.PUBLIC_APP_URL?.includes("agent.telvoice.cl")
    ? process.env.PUBLIC_APP_URL
    : "https://agent.telvoice.cl")
).replace(/\/$/, "");
const COMPANY_ID = "6cd1db92-d5c7-45e0-8548-df8907843350";
const CLIENT_EMAIL = "cliente.demo@telvoice.cl";
const SA_EMAIL = process.env.SUPERADMIN_EMAIL?.trim();
const SA_PASS = process.env.SUPERADMIN_PASSWORD?.trim();
const PHONE = "+56934449937";
const SENDER = "EMPRESADEMO";
const MESSAGE = "Prueba campaña live Telvoice controlada";
const DLR_WAIT_MS = Number(process.env.CAMPAIGN_LIVE_DLR_WAIT_MS ?? 180_000);
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

function sanitizeProviderResponse(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const out = { ...raw };
  for (const k of ["api_id", "api_password", "password", "token"]) {
    if (k in out) delete out[k];
  }
  return out;
}

const previewSvc = await import(pathToFileURL(distPreview).toString());
const { createContact, createContactList } = await import(
  pathToFileURL(join(__dirname, "../dist/services/contactService.js")).toString(),
);
const { getCompanyBalance } = await import(
  pathToFileURL(join(__dirname, "../dist/services/smsWalletService.js")).toString(),
);

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const suffix = String(Date.now()).slice(-6);
let campaignId = null;
let contactId = null;
let listId = null;
let messageId = null;
let queueId = null;

await client.connect();

async function queryState() {
  const wallet = (await getCompanyBalance(COMPANY_ID)).availableSms;
  const camp = campaignId
    ? (
        await client.query(
          "select status, mode, sender_id from sms_campaigns where id=$1",
          [campaignId],
        )
      ).rows[0]
    : null;
  const msg = messageId
    ? (
        await client.query(
          `select id, status, mode, provider, sender_id, provider_message_id,
                  error_code, error_message
           from panel_sms_messages where id=$1`,
          [messageId],
        )
      ).rows[0]
    : null;
  const queue = queueId
    ? (
        await client.query(
          "select id, status, attempts, error_code, error_message from sms_send_queue where id=$1",
          [queueId],
        )
      ).rows[0]
    : null;
  const debits = messageId
    ? (
        await client.query(
          `select id, type, sms_amount, reference_type, reference_id, created_at
           from wallet_transactions
           where company_id=$1 and type='sms_debit' and reference_id=$2`,
          [COMPANY_ID, messageId],
        )
      ).rows
    : [];
  const events = messageId
    ? (
        await client.query(
          `select id, status, provider_message_id, created_at,
                  raw_payload->>'event' as event
           from panel_sms_delivery_events where message_id=$1 order by created_at`,
          [messageId],
        )
      ).rows
    : [];
  return { wallet, camp, msg, queue, debits, events };
}

try {
  // Scheduler OFF check
  const saCookiePre = await login(SA_EMAIL, SA_PASS);
  const tcPre = await fetch(`${BASE}/admin/traffic-control`, {
    headers: { Cookie: saCookiePre },
    redirect: "follow",
  });
  const tcHtml = await tcPre.text();
  if (!tcHtml.includes("Inactivo") || tcHtml.includes("Activo — cada")) {
    throw new Error("Scheduler no está OFF — abortando QA");
  }
  console.log("Scheduler OFF confirmado");

  const pending = await client.query(
    `select count(*)::int c from sms_send_queue q
     join sms_campaigns c on c.id=q.campaign_id
     where c.company_id=$1 and c.mode='live' and q.status in ('queued','processing')`,
    [COMPANY_ID],
  );
  if (pending.rows[0].c > 0) {
    throw new Error(`Hay ${pending.rows[0].c} colas live pendientes — abortando`);
  }

  const walletBefore = (await getCompanyBalance(COMPANY_ID)).availableSms;
  console.log("wallet_before:", walletBefore);

  const clientCookie = await login(CLIENT_EMAIL, getDemoPassword());

  const list = await createContactList(COMPANY_ID, {
    name: `QA Live Controlled ${suffix}`,
  });
  listId = list.id;

  const { rows: existingContact } = await client.query(
    "select id from contacts where company_id=$1 and phone=$2 limit 1",
    [COMPANY_ID, PHONE],
  );
  if (existingContact[0]) {
    contactId = existingContact[0].id;
    await client.query(
      `insert into contact_list_members (company_id, list_id, contact_id)
       values ($1,$2,$3) on conflict (list_id, contact_id) do nothing`,
      [COMPANY_ID, list.id, contactId],
    );
  } else {
    const contact = await createContact(COMPANY_ID, {
      display_name: "QA Live Controlled",
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
    campaignName: `QA Live Controlled ${suffix}`,
  });
  const recipients =
    preview.validRecipientCount ?? preview.audience?.totalFound ?? preview.totalRecipients;
  if (recipients !== 1) {
    throw new Error(`recipients=${recipients}, esperado 1`);
  }

  const draft = await previewSvc.createCampaignDraftFromPreview(COMPANY_ID, preview);
  campaignId = draft.id;

  const { rows: draftMsgs } = await client.query(
    "select count(*)::int c from panel_sms_messages where campaign_id=$1",
    [campaignId],
  );
  const { rows: draftQueue } = await client.query(
    "select count(*)::int c from sms_send_queue where campaign_id=$1",
    [campaignId],
  );
  const { rows: draftRow } = await client.query(
    "select status, mode, sender_id from sms_campaigns where id=$1",
    [campaignId],
  );
  if (draftRow[0].status !== "draft" || draftRow[0].mode !== "mock") {
    throw new Error(`draft inválido: ${JSON.stringify(draftRow[0])}`);
  }
  if (draftRow[0].sender_id !== SENDER) {
    throw new Error(`sender draft=${draftRow[0].sender_id}, esperado ${SENDER}`);
  }
  if (draftMsgs[0].c > 0 || draftQueue[0].c > 0) {
    throw new Error("draft no debe tener mensajes/cola");
  }
  const walletAfterDraft = (await getCompanyBalance(COMPANY_ID)).availableSms;
  if (walletAfterDraft !== walletBefore) {
    throw new Error("wallet cambió en draft");
  }

  console.log("\n=== DRAFT OK ===");
  console.log(JSON.stringify({ campaign_id: campaignId, sender: SENDER, wallet: walletAfterDraft }, null, 2));

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

  const walletAfterLaunch = (await getCompanyBalance(COMPANY_ID)).availableSms;
  const { rows: msgsLaunch } = await client.query(
    `select id, status, mode, provider, sender_id, provider_message_id
     from panel_sms_messages where campaign_id=$1`,
    [campaignId],
  );
  const { rows: queueLaunch } = await client.query(
    "select id, status from sms_send_queue where campaign_id=$1",
    [campaignId],
  );
  const { rows: campLaunch } = await client.query(
    "select status, mode from sms_campaigns where id=$1",
    [campaignId],
  );
  const { rows: debLaunch } = await client.query(
    `select count(*)::int c from wallet_transactions
     where company_id=$1 and type='sms_debit' and reference_id = any($2::uuid[])`,
    [COMPANY_ID, msgsLaunch.map((m) => m.id)],
  );

  if (campLaunch[0].status !== "processing" || campLaunch[0].mode !== "live") {
    throw new Error(`campaña post-launch: ${JSON.stringify(campLaunch[0])}`);
  }
  if (msgsLaunch.length !== 1 || msgsLaunch[0].status !== "queued" || msgsLaunch[0].mode !== "live") {
    throw new Error(`mensaje post-launch: ${JSON.stringify(msgsLaunch)}`);
  }
  if (msgsLaunch[0].sender_id !== SENDER) {
    throw new Error(`sender mensaje=${msgsLaunch[0].sender_id}`);
  }
  if (msgsLaunch[0].provider_message_id) {
    throw new Error("provider_message_id debe ser null tras launch");
  }
  if (queueLaunch.length !== 1 || queueLaunch[0].status !== "queued") {
    throw new Error(`cola post-launch: ${JSON.stringify(queueLaunch)}`);
  }
  if (walletAfterLaunch !== walletBefore) throw new Error("wallet cambió en launch");
  if (debLaunch[0].c > 0) throw new Error("sms_debit en launch");

  messageId = msgsLaunch[0].id;
  queueId = queueLaunch[0].id;

  console.log("\n=== LAUNCH OK ===");
  console.log(
    JSON.stringify(
      {
        campaign_id: campaignId,
        message_id: messageId,
        queue_id: queueId,
        sender: msgsLaunch[0].sender_id,
        wallet_unchanged: true,
      },
      null,
      2,
    ),
  );

  const tickRes = await fetch(`${BASE}/admin/traffic-control/queue/process-tick`, {
    method: "POST",
    headers: {
      Cookie: saCookiePre,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ limit: "1" }),
    redirect: "manual",
  });
  const tickLoc = tickRes.headers.get("location") ?? "";
  console.log("\n=== TICK 1 ===");
  console.log(JSON.stringify({ status: tickRes.status, location: tickLoc }, null, 2));

  await sleep(4000);

  let state = await queryState();
  let providerRaw = null;
  if (state.events.length) {
    const last = state.events[state.events.length - 1];
    const { rows: evFull } = await client.query(
      "select raw_payload from panel_sms_delivery_events where id=$1",
      [last.id],
    );
    providerRaw = sanitizeProviderResponse(evFull[0]?.raw_payload ?? {});
  }

  // DLR wait if submit
  let dlrStatus = "n/a";
  if (state.msg?.provider_message_id) {
    dlrStatus = "pending";
    const start = Date.now();
    while (Date.now() - start < DLR_WAIT_MS) {
      const { rows: m } = await client.query(
        "select status, provider_message_id from panel_sms_messages where id=$1",
        [messageId],
      );
      const { rows: ev } = await client.query(
        `select status from panel_sms_delivery_events where message_id=$1 order by created_at`,
        [messageId],
      );
      state = await queryState();
      if (m[0]?.status === "delivered") {
        dlrStatus = "delivered";
        break;
      }
      if (ev.some((e) => String(e.status).toLowerCase() === "delivered")) {
        dlrStatus = "delivered_event";
        break;
      }
      await sleep(DLR_POLL_MS);
    }
  } else if (state.msg?.status === "failed" || state.queue?.status === "failed") {
    dlrStatus = "no_submit";
  }

  // Idempotency counts
  const { rows: msgCount } = await client.query(
    "select count(*)::int c from panel_sms_messages where campaign_id=$1",
    [campaignId],
  );
  const { rows: queueCount } = await client.query(
    "select count(*)::int c from sms_send_queue where campaign_id=$1",
    [campaignId],
  );
  const { rows: debCount } = await client.query(
    `select count(*)::int c from wallet_transactions
     where company_id=$1 and type='sms_debit' and reference_id=$2`,
    [COMPANY_ID, messageId],
  );

  const tcPost = await fetch(`${BASE}/admin/traffic-control`, {
    headers: { Cookie: saCookiePre },
    redirect: "follow",
  });
  const tcPostHtml = await tcPost.text();
  const schMatch = tcPostHtml.match(/Scheduler de cola[\s\S]*?<strong>([^<]+)<\/strong>/);
  const schedulerLabel = schMatch ? schMatch[1] : null;

  const deliverable = {
    campaign_id: campaignId,
    message_id: messageId,
    queue_id: queueId,
    sender: SENDER,
    wallet_before: walletBefore,
    wallet_after: state.wallet,
    provider_message_id: state.msg?.provider_message_id ?? null,
    provider_response_sanitized: providerRaw,
    campaign_final_status: state.camp?.status,
    message_final_status: state.msg?.status,
    queue_final_status: state.queue?.status,
    message_error: state.msg?.error_message ?? null,
    queue_error: state.queue?.error_message ?? null,
    wallet_transactions: state.debits,
    delivery_events: state.events,
    dlr_status: dlrStatus,
    message_count: msgCount[0].c,
    queue_count: queueCount[0].c,
    debit_count: debCount[0].c,
    no_duplicate_message: msgCount[0].c === 1,
    no_duplicate_debit: debCount[0].c <= 1,
    scheduler_still_off: schedulerLabel?.includes("Inactivo") ?? false,
    scheduler_label: schedulerLabel,
    physical_receipt: "pendiente confirmación Victor",
    no_billing_mercadopago: true,
  };

  console.log("\n========== ENTREGABLE QA LIVE CONTROLADA ==========");
  console.log(JSON.stringify(deliverable, null, 2));
} catch (e) {
  console.error("FAIL:", e.message);
  if (campaignId) {
    try {
      const s = await queryState();
      console.log("Estado parcial:", JSON.stringify(s, null, 2));
    } catch {
      /* ignore */
    }
  }
  process.exit(1);
} finally {
  await client.end();
}
