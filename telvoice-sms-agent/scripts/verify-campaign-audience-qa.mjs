#!/usr/bin/env node
/**
 * QA audiencia y preview de campaña (Etapa 4) — sin envío SMS ni wallet.
 *
 * Uso: npm run build && node scripts/verify-campaign-audience-qa.mjs
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

const distAudience = join(__dirname, "../dist/services/campaignAudienceService.js");
const distPreview = join(__dirname, "../dist/services/campaignPreviewService.js");
const distContact = join(__dirname, "../dist/services/contactService.js");
if (!existsSync(distAudience) || !existsSync(distPreview)) {
  console.error("Ejecuta npm run build primero");
  process.exit(1);
}

const audience = await import(pathToFileURL(distAudience).toString());
const previewSvc = await import(pathToFileURL(distPreview).toString());
const { createContact, createContactList } = await import(
  pathToFileURL(distContact).toString(),
);
const { AppError } = await import(
  pathToFileURL(join(__dirname, "../dist/utils/errors.js")).toString(),
);

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const suffix = String(Date.now()).slice(-7);
const phoneA = `+56988${suffix}`.slice(0, 12);
const phoneB = `+56977${suffix}`.slice(0, 12);

await client.connect();
try {
  const { rows: companies } = await client.query(
    `SELECT id FROM companies WHERE status='active' ORDER BY created_at LIMIT 1`,
  );
  const companyId = companies[0]?.id;
  if (!companyId) throw new Error("Sin company activa");

  const { rows: w0 } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions WHERE company_id=$1`,
    [companyId],
  );
  const { rows: m0 } = await client.query(
    `SELECT count(*)::int c FROM panel_sms_messages WHERE company_id=$1`,
    [companyId],
  );
  const walletBefore = w0[0].c;
  const messagesBefore = m0[0].c;

  const list = await createContactList(companyId, {
    name: `QA Camp List ${suffix}`,
  });
  const c1 = await createContact(companyId, {
    display_name: "QA Camp A",
    phone: phoneA,
    list_id: list.id,
    source: "manual",
  });
  const c2 = await createContact(companyId, {
    display_name: "QA Camp B",
    phone: phoneB,
    source: "manual",
  });

  const fromList = await audience.resolveAudienceFromList(companyId, list.id);
  if (fromList.validCount < 1) throw new Error("audiencia lista sin válidos");

  const fromContacts = await audience.resolveAudienceFromContacts(companyId, [
    c1.id,
    c2.id,
  ]);
  if (fromContacts.validCount !== 2) throw new Error("audiencia contactos != 2");

  const dupMembers = [
    {
      contactId: c1.id,
      displayName: c1.display_name,
      phone: phoneA,
      phoneNormalized: phoneA,
      status: "active",
      included: true,
    },
    {
      contactId: c2.id,
      displayName: "dup",
      phone: phoneA,
      phoneNormalized: phoneA,
      status: "active",
      included: true,
    },
  ];
  const deduped = audience.dedupeAudienceByPhone(dupMembers);
  if (deduped.duplicatesOmitted !== 1) throw new Error("dedupe falló");

  const preview = await previewSvc.buildCampaignPreview({
    companyId,
    audienceSource: { type: "list", listId: list.id },
    senderId: "TELVOICE",
    message: "Hola QA campaña preview",
    campaignName: `QA Preview ${suffix}`,
  });
  if (preview.validRecipientCount < 1) throw new Error("preview sin válidos");
  if (preview.totalSmsEstimated < 1) throw new Error("costo estimado 0");
  if (preview.sendEnabled !== false) throw new Error("sendEnabled debe ser false");

  const draft = await previewSvc.createCampaignDraftFromPreview(companyId, preview);
  const { rows: camp } = await client.query(
    `SELECT status, mode, metadata FROM sms_campaigns WHERE id=$1 AND company_id=$2`,
    [draft.id, companyId],
  );
  if (camp[0]?.status !== "draft") throw new Error("draft status");
  if (camp[0]?.mode !== "mock") throw new Error("draft usa mode mock");
  const meta = camp[0]?.metadata ?? {};
  if (meta.send_enabled !== false) throw new Error("metadata send_enabled");

  const { rows: msgs } = await client.query(
    `SELECT count(*)::int c FROM panel_sms_messages WHERE company_id=$1`,
    [companyId],
  );
  if (msgs[0].c !== messagesBefore) throw new Error("panel_sms_messages creció");

  const { rows: w1 } = await client.query(
    `SELECT count(*)::int c FROM wallet_transactions WHERE company_id=$1`,
    [companyId],
  );
  if (w1[0].c !== walletBefore) throw new Error("wallet_transactions cambió");

  let blockedOk = false;
  try {
    await audience.resolveAudienceFromContacts(companyId, ["00000000-0000-0000-0000-000000000000"]);
  } catch (e) {
    blockedOk = e instanceof AppError && e.statusCode === 403;
  }
  if (!blockedOk) throw new Error("aislamiento company_id");

  await client.query(`DELETE FROM sms_campaigns WHERE id=$1`, [draft.id]);
  await client.query(`DELETE FROM contact_list_members WHERE list_id=$1`, [list.id]);
  await client.query(`DELETE FROM contacts WHERE id IN ($1,$2)`, [c1.id, c2.id]);
  await client.query(`DELETE FROM contact_lists WHERE id=$1`, [list.id]);

  console.log("verify-campaign-audience-qa: TODO OK");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
