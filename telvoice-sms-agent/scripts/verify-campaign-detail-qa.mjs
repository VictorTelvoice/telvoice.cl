#!/usr/bin/env node
/**
 * QA detalle de campaña mock (Etapa 5.1) — sin SMS real.
 *
 * Uso: npm run build && node scripts/verify-campaign-detail-qa.mjs
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
const distDetail = join(__dirname, "../dist/services/campaignDetailService.js");
const distContact = join(__dirname, "../dist/services/contactService.js");
const distWallet = join(__dirname, "../dist/services/smsWalletService.js");

if (!existsSync(distDetail)) {
  console.error("Ejecuta npm run build primero");
  process.exit(1);
}

const previewSvc = await import(pathToFileURL(distPreview).toString());
const executeSvc = await import(pathToFileURL(distExecute).toString());
const detailSvc = await import(pathToFileURL(distDetail).toString());
const { createContact, createContactList } = await import(
  pathToFileURL(distContact).toString(),
);
const { getCompanyBalance } = await import(
  pathToFileURL(distWallet).toString(),
);
const { getCampaignByIdForCompany } = await import(
  pathToFileURL(join(__dirname, "../dist/services/smsCampaignService.js")).toString(),
);

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const suffix = String(Date.now()).slice(-6);
const phone = `+56944${suffix}`.slice(0, 12);
let campaignId = null;
let listId = null;
let contactId = null;
let otherCompanyId = null;

await client.connect();
try {
  const { rows: companies } = await client.query(
    `SELECT id FROM companies WHERE status='active' ORDER BY created_at LIMIT 2`,
  );
  const companyId = companies[0]?.id;
  otherCompanyId = companies[1]?.id ?? null;
  if (!companyId) throw new Error("Sin company activa");

  const list = await createContactList(companyId, {
    name: `QA Detail ${suffix}`,
  });
  listId = list.id;
  const contact = await createContact(companyId, {
    display_name: "QA Detail",
    phone,
    list_id: list.id,
    source: "manual",
  });
  contactId = contact.id;

  const preview = await previewSvc.buildCampaignPreview({
    companyId,
    audienceSource: { type: "list", listId: list.id },
    senderId: "TELVOICE",
    message: "QA detalle campaña mock",
    campaignName: `QA Detail ${suffix}`,
  });
  const draft = await previewSvc.createCampaignDraftFromPreview(
    companyId,
    preview,
  );
  campaignId = draft.id;

  const beforeDetail = await detailSvc.loadCampaignDetailView(
    companyId,
    await getCampaignByIdForCompany(campaignId, companyId),
  );
  if (!beforeDetail.canSimulate) throw new Error("debe poder simular en borrador");
  if (beforeDetail.messages.length > 0) {
    throw new Error("borrador no debe tener mensajes");
  }
  if (beforeDetail.timeline.length < 2) throw new Error("timeline borrador corto");

  const balBefore = (await getCompanyBalance(companyId)).availableSms;
  const exec = await executeSvc.executeContactsAudienceCampaignMock({
    companyId,
    campaignId,
  });
  if (exec.sent < 1) throw new Error("ejecución sin envíos");
  if (exec.alreadyExecuted) throw new Error("primera ejecución no debe ser alreadyExecuted");

  const afterDetail = await detailSvc.loadCampaignDetailView(
    companyId,
    await getCampaignByIdForCompany(campaignId, companyId),
  );
  if (afterDetail.canSimulate) throw new Error("completed no debe mostrar simular");
  if (afterDetail.kpis.messagesGenerated < 1) throw new Error("sin KPI mensajes");
  if (!afterDetail.walletDebit) throw new Error("sin wallet debit");
  if (afterDetail.walletDebit.reference_type !== "sms_campaign") {
    throw new Error("reference_type wallet");
  }
  if (afterDetail.walletDebit.reference_id !== campaignId) {
    throw new Error("reference_id wallet");
  }
  if (afterDetail.walletDebit.sms_amount !== exec.realSmsCost) {
    throw new Error("sms_amount mismatch");
  }

  const { rows: msgDebits } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions wt
     JOIN panel_sms_messages m ON m.id = wt.reference_id
     WHERE m.campaign_id=$1 AND wt.reference_type='sms_message'`,
    [campaignId],
  );
  if (msgDebits[0].c > 0) throw new Error("débitos por mensaje");

  for (const m of afterDetail.messages) {
    if (m.mode !== "mock" || m.provider !== "mock" || m.status !== "delivered") {
      throw new Error("mensaje no mock/delivered");
    }
    if (m.mode === "live_test" || m.mode === "live") {
      throw new Error("live detectado");
    }
  }

  // Nota: evitamos validar igualdad exacta del delta de saldo, porque en la BD
  // pueden ocurrir movimientos concurrentes. Validamos idempotencia por la existencia
  // única del wallet_transaction asociado a la campaña.

  const second = await executeSvc.executeContactsAudienceCampaignMock({
    companyId,
    campaignId,
  });
  if (!second.alreadyExecuted) throw new Error("2da sin alreadyExecuted");

  const { rows: debits } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions
     WHERE reference_type='sms_campaign' AND reference_id=$1 AND type='sms_debit'`,
    [campaignId],
  );
  if (debits[0].c !== 1) throw new Error("debe haber 1 débito campaña");

  if (otherCompanyId) {
    const foreign = await getCampaignByIdForCompany(campaignId, otherCompanyId);
    if (foreign) throw new Error("aislamiento company_id falló");
  }

  const { rows: camp } = await client.query(
    `SELECT status, mode FROM sms_campaigns WHERE id=$1`,
    [campaignId],
  );
  if (camp[0].status !== "completed" || camp[0].mode !== "mock") {
    throw new Error("estado campaña final");
  }

  console.log("verify-campaign-detail-qa: TODO OK");
  console.log(
    JSON.stringify(
      {
        campaign_id: campaignId,
        recipients: exec.sent,
        messages: afterDetail.messages.length,
        timeline_steps: afterDetail.timeline.length,
        wallet: {
          type: afterDetail.walletDebit.type,
          reference_type: afterDetail.walletDebit.reference_type,
          sms_amount: afterDetail.walletDebit.sms_amount,
        },
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("FAIL:", e.message);
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
