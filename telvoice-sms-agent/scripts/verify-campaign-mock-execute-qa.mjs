#!/usr/bin/env node
/**
 * QA ejecución mock de campaña (Etapa 5) — 1 débito por campaña, sin SMS real.
 *
 * Uso: npm run build && node scripts/verify-campaign-mock-execute-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const conn = process.env.DATABASE_URL?.trim();
if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const distPreview = join(__dirname, "../dist/services/campaignPreviewService.js");
const distExecute = join(__dirname, "../dist/services/campaignMockExecuteService.js");
const distContact = join(__dirname, "../dist/services/contactService.js");
const distWallet = join(__dirname, "../dist/services/smsWalletService.js");
if (!existsSync(distPreview) || !existsSync(distExecute)) {
  console.error("Ejecuta npm run build primero");
  process.exit(1);
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

const suffix = String(Date.now()).slice(-7);
const phoneA = `+56966${suffix}`.slice(0, 12);

await client.connect();
const cleanup = { campaignId: null, contactIds: [], listId: null };

async function countCampaignDebits(campaignId, companyId) {
  const { rows } = await client.query(
    `SELECT id, type, reference_type, reference_id, sms_amount, metadata, description
     FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit' AND reference_type='sms_campaign' AND reference_id=$2`,
    [companyId, campaignId],
  );
  return rows;
}

async function countMessageDebits(campaignId, companyId) {
  const { rows } = await client.query(
    `SELECT wt.id FROM wallet_transactions wt
     JOIN panel_sms_messages m ON m.id = wt.reference_id
     WHERE m.campaign_id=$1 AND wt.company_id=$2
       AND wt.type='sms_debit' AND wt.reference_type='sms_message'`,
    [campaignId, companyId],
  );
  return rows;
}

try {
  const { rows: companies } = await client.query(
    `SELECT id FROM companies WHERE status='active' ORDER BY created_at LIMIT 1`,
  );
  const companyId = companies[0]?.id;
  if (!companyId) throw new Error("Sin company activa");

  const list = await createContactList(companyId, {
    name: `QA Mock Exec ${suffix}`,
  });
  cleanup.listId = list.id;

  const c1 = await createContact(companyId, {
    display_name: "QA Mock Exec",
    phone: phoneA,
    list_id: list.id,
    source: "manual",
  });
  cleanup.contactIds.push(c1.id);

  const preview = await previewSvc.buildCampaignPreview({
    companyId,
    audienceSource: { type: "list", listId: list.id },
    senderId: "TELVOICE",
    message: "Hola QA mock execute",
    campaignName: `QA Mock Exec ${suffix}`,
  });

  const draft = await previewSvc.createCampaignDraftFromPreview(
    companyId,
    preview,
  );
  cleanup.campaignId = draft.id;

  const balanceBefore = (await getCompanyBalance(companyId)).availableSms;

  const result = await executeSvc.executeContactsAudienceCampaignMock({
    companyId,
    campaignId: draft.id,
  });

  if (result.sent < 1) throw new Error("mock execute sin envíos");
  if (result.status !== "completed") throw new Error("status campaña != completed");
  if (result.alreadyExecuted) throw new Error("primera ejecución no debe ser alreadyExecuted");

  const balanceAfterFirst = (await getCompanyBalance(companyId)).availableSms;
  const debitedOnce = balanceBefore - balanceAfterFirst;
  if (debitedOnce !== result.realSmsCost) {
    throw new Error(
      `saldo: esperado -${result.realSmsCost}, obtuvo -${debitedOnce}`,
    );
  }

  const { rows: camp } = await client.query(
    `SELECT status, mode, real_sms_cost, metadata FROM sms_campaigns WHERE id=$1`,
    [draft.id],
  );
  if (camp[0]?.status !== "completed") throw new Error("BD campaña status");
  if (camp[0]?.mode !== "mock") throw new Error("BD campaña mode debe ser mock");
  if (camp[0]?.real_sms_cost !== result.realSmsCost) {
    throw new Error("real_sms_cost campaña != débito");
  }

  const campaignDebits = await countCampaignDebits(draft.id, companyId);
  if (campaignDebits.length !== 1) {
    throw new Error(`wallet_transactions campaña: esperado 1, hay ${campaignDebits.length}`);
  }
  const wt = campaignDebits[0];
  if (wt.type !== "sms_debit") throw new Error("wallet type != sms_debit");
  if (wt.reference_type !== "sms_campaign") {
    throw new Error(`reference_type != sms_campaign (${wt.reference_type})`);
  }
  if (wt.reference_id !== draft.id) throw new Error("reference_id != campaign_id");
  if (wt.sms_amount !== result.realSmsCost) {
    throw new Error(`sms_amount ${wt.sms_amount} != real_sms_cost ${result.realSmsCost}`);
  }
  if (wt.description !== "Consumo por campaña SMS mock") {
    throw new Error("description incorrecta");
  }
  const wmeta = wt.metadata ?? {};
  if (wmeta.source !== "campaign_mock_execution") throw new Error("metadata.source");
  if (wmeta.recipient_count !== result.sent) throw new Error("metadata.recipient_count");
  if (wmeta.message_count !== result.sent) throw new Error("metadata.message_count");
  if (wmeta.simulated !== true) throw new Error("metadata.simulated");

  const messageDebits = await countMessageDebits(draft.id, companyId);
  if (messageDebits.length > 0) {
    throw new Error(`hay ${messageDebits.length} débito(s) sms_message (debe ser 0)`);
  }

  const { rows: msgs } = await client.query(
    `SELECT status, mode, provider, metadata FROM panel_sms_messages WHERE campaign_id=$1`,
    [draft.id],
  );
  if (!msgs.length) throw new Error("sin panel_sms_messages");
  for (const m of msgs) {
    if (m.mode !== "mock") throw new Error("mensaje mode != mock");
    if (m.provider !== "mock") throw new Error("mensaje provider != mock (SMS real?)");
    if (m.status !== "delivered") throw new Error(`mensaje status: ${m.status}`);
    const meta = m.metadata ?? {};
    if (meta.simulated !== true) throw new Error("mensaje sin flag simulated");
    if (meta.campaign_id !== draft.id) throw new Error("mensaje sin campaign_id metadata");
    if (!meta.contact_id) throw new Error("mensaje sin contact_id metadata");
  }

  const liveMsgs = msgs.filter(
    (m) => m.mode === "live" || m.mode === "live_test" || m.provider !== "mock",
  );
  if (liveMsgs.length) throw new Error("detectado envío live/live_test o no-mock");

  const { rows: dlr } = await client.query(
    `SELECT e.status, e.provider FROM panel_sms_delivery_events e
     JOIN panel_sms_messages m ON m.id = e.message_id
     WHERE m.campaign_id=$1`,
    [draft.id],
  );
  if (!dlr.length) throw new Error("sin eventos DLR mock");
  for (const e of dlr) {
    if (e.provider !== "mock") throw new Error("DLR provider != mock");
    if (!["sent", "delivered"].includes(e.status)) {
      throw new Error(`DLR status inesperado: ${e.status}`);
    }
  }

  const second = await executeSvc.executeContactsAudienceCampaignMock({
    companyId,
    campaignId: draft.id,
  });
  if (!second.alreadyExecuted) {
    throw new Error("segunda ejecución debe devolver alreadyExecuted");
  }

  const balanceAfterSecond = (await getCompanyBalance(companyId)).availableSms;
  if (balanceAfterSecond !== balanceAfterFirst) {
    throw new Error("segunda ejecución descontó saldo de nuevo");
  }

  const campaignDebits2 = await countCampaignDebits(draft.id, companyId);
  if (campaignDebits2.length !== 1) {
    throw new Error(`tras re-ejecución: ${campaignDebits2.length} débitos campaña`);
  }

  const messageDebits2 = await countMessageDebits(draft.id, companyId);
  if (messageDebits2.length > 0) {
    throw new Error("tras re-ejecución hay débitos sms_message");
  }

  console.log("verify-campaign-mock-execute-qa: TODO OK");
  console.log(
    `  sent=${result.sent} real_sms_cost=${result.realSmsCost} wallet_debits=1 (sms_campaign)`,
  );
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  if (cleanup.campaignId) {
    await client.query(
      `DELETE FROM panel_sms_delivery_events WHERE message_id IN (
         SELECT id FROM panel_sms_messages WHERE campaign_id=$1)`,
      [cleanup.campaignId],
    );
    await client.query(
      `DELETE FROM wallet_transactions WHERE reference_type='sms_campaign' AND reference_id=$1`,
      [cleanup.campaignId],
    );
    await client.query(
      `DELETE FROM wallet_transactions WHERE reference_id IN (
         SELECT id FROM panel_sms_messages WHERE campaign_id=$1)`,
      [cleanup.campaignId],
    );
    await client.query(
      `DELETE FROM panel_sms_messages WHERE campaign_id=$1`,
      [cleanup.campaignId],
    );
    await client.query(`DELETE FROM sms_campaigns WHERE id=$1`, [
      cleanup.campaignId,
    ]);
  }
  if (cleanup.listId) {
    await client.query(
      `DELETE FROM contact_list_members WHERE list_id=$1`,
      [cleanup.listId],
    );
    await client.query(`DELETE FROM contact_lists WHERE id=$1`, [
      cleanup.listId,
    ]);
  }
  if (cleanup.contactIds.length) {
    await client.query(`DELETE FROM contacts WHERE id = ANY($1::uuid[])`, [
      cleanup.contactIds,
    ]);
  }
  await client.end();
}
