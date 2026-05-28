#!/usr/bin/env node
/**
 * Auditoría onboarding cuenta nueva (compra landing Bolsa 200 → claim → campañas).
 *
 * Uso:
 *   node scripts/new-account-onboarding-audit.mjs --email=user@example.com
 *   node scripts/new-account-onboarding-audit.mjs --order-id=uuid
 *   node scripts/new-account-onboarding-audit.mjs --email=... --enable-campaigns --max-tps=2
 *   node scripts/new-account-onboarding-audit.mjs --email=... --create-audience
 *   node scripts/new-account-onboarding-audit.mjs --email=... --create-campaign-draft
 *   node scripts/new-account-onboarding-audit.mjs --email=... --launch-campaign  # solo si Victor confirmó
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_200 = "204786a5-0e70-43d4-8339-8403ccf810c4";
const RETAIL_PLAN = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";
const LIST_NAME = "QA Campaña Nueva Cuenta 001";
const CAMPAIGN_NAME = "QA Campaña Nueva Cuenta 001";
const CAMPAIGN_MESSAGE =
  "Hola, prueba de envio SMS Telvoice. Gracias por tu preferencia.";

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const email = arg("email")?.toLowerCase().trim();
const orderIdArg = arg("order-id");
const enableCampaigns = process.argv.includes("--enable-campaigns");
const createAudience = process.argv.includes("--create-audience");
const createCampaignDraft = process.argv.includes("--create-campaign-draft");
const launchCampaign = process.argv.includes("--launch-campaign");
const maxTps = Number(arg("max-tps") ?? "2");

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

function maskPhone(p) {
  const d = String(p ?? "").replace(/[^\d+]/g, "");
  return d.length < 6 ? "***" : d.slice(0, 4) + "****" + d.slice(-3);
}

function parseVerifyPhones() {
  const raw = process.env.TELVOICE_VERIFY_NUMBERS ?? "";
  return raw
    .split("|")
    .map((p) => p.split(":")[0]?.trim())
    .filter(Boolean);
}

const c = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const report = { phase: "new_account_onboarding", steps: {} };

let order = null;
if (orderIdArg) {
  order = (
    await c.query(
      `SELECT o.*, p.name AS package_name FROM sms_orders o
       LEFT JOIN sms_packages p ON p.id = o.package_id WHERE o.id = $1`,
      [orderIdArg],
    )
  ).rows[0];
} else if (email) {
  order = (
    await c.query(
      `SELECT o.*, p.name AS package_name FROM sms_orders o
       LEFT JOIN sms_packages p ON p.id = o.package_id
       WHERE lower(coalesce(o.checkout_email, '')) = $1
          OR lower(coalesce(o.payer_email, '')) = $1
       ORDER BY o.created_at DESC LIMIT 1`,
      [email],
    )
  ).rows[0];
}

const companyId = order?.company_id ?? null;
let company = companyId
  ? (await c.query(`SELECT * FROM companies WHERE id = $1`, [companyId])).rows[0]
  : null;

if (!company && email) {
  company = (
    await c.query(
      `SELECT * FROM companies WHERE lower(coalesce(billing_email, '')) = $1
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    )
  ).rows[0];
}

const resolvedCompanyId = company?.id ?? companyId;
const wallet = resolvedCompanyId
  ? (
      await c.query(
        `SELECT * FROM company_sms_wallets WHERE company_id = $1 LIMIT 1`,
        [resolvedCompanyId],
      )
    ).rows[0]
  : null;

const mpRef =
  order?.metadata?.mercadopago_preference_id ??
  order?.payment_reference ??
  null;

report.post_compra = order
  ? {
      order_id: order.id,
      checkout_email: order.checkout_email,
      payment_status: order.payment_status,
      credit_status: order.credit_status,
      claim_status: order.claim_status,
      package_id: order.package_id,
      package_name: order.package_name,
      sms_quantity: order.sms_quantity,
      amount: order.amount,
      public_checkout_reference: order.public_checkout_reference,
      mercadopago_preference_id: mpRef,
      company_id_before_claim: order.company_id,
      ok_paid: order.payment_status === "paid",
      ok_package: order.package_id === PACKAGE_200,
      ok_pending_claim_or_credited:
        order.credit_status === "pending_claim" ||
        order.credit_status === "credited",
    }
  : { error: "orden_no_encontrada" };

if (order) {
  const walletBeforeClaim = await c.query(
    `SELECT count(*)::int c FROM wallet_transactions wt
     JOIN company_sms_wallets w ON w.id = wt.wallet_id
     WHERE wt.type = 'purchase_credit' AND wt.reference_id = $1`,
    [order.id],
  );
  report.post_compra.wallet_credit_before_claim_rows =
    walletBeforeClaim.rows[0].c;
  report.post_compra.no_wallet_before_claim =
    order.claim_status === "unclaimed" ? walletBeforeClaim.rows[0].c === 0 : null;

  const emailLogs = await c.query(
    `SELECT id, template, status, provider_message_id, created_at
     FROM email_send_log
     WHERE lower(to_email) = lower($1)
     ORDER BY created_at DESC LIMIT 10`,
    [order.checkout_email ?? email ?? ""],
  ).catch(() => ({ rows: [] }));
  report.post_compra.email_logs = emailLogs.rows;
}

report.post_claim = resolvedCompanyId
  ? {
      company_id: resolvedCompanyId,
      company_name: company?.name,
      billing_email: company?.billing_email,
      claim_status: order?.claim_status,
      credit_status: order?.credit_status,
      wallet_id: wallet?.id,
      wallet_balance: wallet?.available_sms,
      purchase_credits: (
        await c.query(
          `SELECT id, sms_amount, created_at FROM wallet_transactions
           WHERE company_id = $1 AND type = 'purchase_credit' ORDER BY created_at`,
          [resolvedCompanyId],
        )
      ).rows,
      rate_plans: (
        await c.query(
          `SELECT traffic_type, campaigns_enabled, api_enabled, max_tps, live_enabled,
                  rate_plan_id, srp.name AS rate_plan_name
           FROM company_rate_plans crp
           LEFT JOIN sms_rate_plans srp ON srp.id = crp.rate_plan_id
           WHERE crp.company_id = $1 AND crp.country = 'CL'`,
          [resolvedCompanyId],
        )
      ).rows,
    }
  : null;

if (resolvedCompanyId) {
  const invoices = await c.query(
    `SELECT id, status, total_amount, created_at FROM billing_invoices
     WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [resolvedCompanyId],
  ).catch(() => ({ rows: [] }));
  report.post_claim.invoices = invoices.rows;

  const billingLogs = await c.query(
    `SELECT id, template, status, provider_message_id, created_at
     FROM billing_email_log
     WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [resolvedCompanyId],
  ).catch(() => ({ rows: [] }));
  report.post_claim.billing_email_logs = billingLogs.rows;
}

if (enableCampaigns && resolvedCompanyId) {
  await c.query(
    `UPDATE company_rate_plans
     SET campaigns_enabled = true, live_enabled = true, api_enabled = false,
         max_tps = $2, status = 'active'
     WHERE company_id = $1 AND country = 'CL' AND status = 'active'`,
    [resolvedCompanyId, maxTps],
  );
  report.campaigns_enabled = true;
  report.post_claim.rate_plans = (
    await c.query(
      `SELECT traffic_type, campaigns_enabled, api_enabled, max_tps, live_enabled, rate_plan_id
       FROM company_rate_plans WHERE company_id = $1 AND country = 'CL'`,
      [resolvedCompanyId],
    )
  ).rows;
}

let listId = null;
let campaignId = null;

if ((createAudience || createCampaignDraft || launchCampaign) && resolvedCompanyId) {
  const distContact = join(__dirname, "../dist/services/contactService.js");
  const distPreview = join(__dirname, "../dist/services/campaignPreviewService.js");
  const distLaunch = join(__dirname, "../dist/services/campaignLiveLaunchService.js");

  if (!existsSync(distContact) || !existsSync(distPreview)) {
    throw new Error("npm run build requerido en agent");
  }

  const { createContact, createContactList } = await import(
    pathToFileURL(distContact).toString(),
  );
  const previewSvc = await import(pathToFileURL(distPreview).toString());

  const phones = parseVerifyPhones();
  if (!phones.length) {
    throw new Error("TELVOICE_VERIFY_NUMBERS vacío para audiencia QA");
  }

  const { rows: existingLists } = await c.query(
    `SELECT id FROM contact_lists WHERE company_id = $1 AND name = $2 LIMIT 1`,
    [resolvedCompanyId, LIST_NAME],
  );
  const list =
    existingLists[0] ?? (await createContactList(resolvedCompanyId, { name: LIST_NAME }));
  listId = list.id;

  const linked = [];
  for (const phone of phones) {
    const { rows: ex } = await c.query(
      `SELECT id FROM contacts WHERE company_id = $1 AND phone = $2 LIMIT 1`,
      [resolvedCompanyId, phone],
    );
    let contactId = ex[0]?.id;
    if (!contactId) {
      const created = await createContact(resolvedCompanyId, {
        display_name: `QA ${maskPhone(phone)}`,
        phone,
        list_id: list.id,
        source: "manual",
      });
      contactId = created.id;
    }
    await c.query(
      `INSERT INTO contact_list_members (company_id, list_id, contact_id)
       VALUES ($1,$2,$3) ON CONFLICT (list_id, contact_id) DO NOTHING`,
      [resolvedCompanyId, list.id, contactId],
    );
    linked.push({ contactId, phone: maskPhone(phone) });
  }

  report.audience = { list_id: listId, contacts_linked: linked.length, phones_masked: linked };

  if (createCampaignDraft || launchCampaign) {
    const { rows: senders } = await c.query(
      `SELECT sender_id FROM company_senders WHERE company_id = $1 AND status = 'active'
       ORDER BY is_default DESC NULLS LAST LIMIT 1`,
      [resolvedCompanyId],
    ).catch(() => ({ rows: [] }));

    const senderId = senders[0]?.sender_id ?? "TELVOICE";

    const preview = await previewSvc.buildCampaignPreview({
      companyId: resolvedCompanyId,
      audienceSource: { type: "list", listId: list.id },
      senderId,
      message: CAMPAIGN_MESSAGE,
      campaignName: CAMPAIGN_NAME,
    });

    report.campaign_preview = {
      sender_id: senderId,
      validRecipientCount: preview.validRecipientCount,
      segmentsPerMessage: preview.segmentsPerMessage,
      totalSmsEstimated: preview.totalSmsEstimated,
      balanceAvailable: preview.balanceAvailable,
      balanceAfter: preview.balanceAfter,
      canProceed: preview.canProceed,
      blockReason: preview.blockReason,
      encoding: preview.encoding,
    };

    const draft = await previewSvc.createCampaignDraftFromPreview(
      resolvedCompanyId,
      preview,
    );
    campaignId = draft.id;
    report.campaign_draft_id = campaignId;

    if (launchCampaign) {
      const launchSvc = await import(pathToFileURL(distLaunch).toString());
      const launch = await launchSvc.launchLiveCampaign(resolvedCompanyId, draft.id, {
        consentConfirmed: true,
        confirmText: launchSvc.LIVE_CAMPAIGN_CONFIRM_TEXT,
        launchedBy: "script:new-account-onboarding-audit",
      });
      report.campaign_launch = launch;
    }
  }
}

if (campaignId) {
  const msgs = await c.query(
    `SELECT status, count(*)::int c FROM panel_sms_messages WHERE campaign_id = $1 GROUP BY status`,
    [campaignId],
  );
  report.campaign_messages = msgs.rows;
}

report.deliverable = {
  order_id: order?.id ?? null,
  mercadopago_preference_id: mpRef,
  email: order?.checkout_email ?? email ?? null,
  company_id: resolvedCompanyId,
  wallet_id: wallet?.id ?? null,
  saldo_inicial: wallet?.available_sms ?? null,
  rate_plan: RETAIL_PLAN,
  campaigns_enabled: report.post_claim?.rate_plans?.some((r) => r.campaigns_enabled),
  campaign_id: campaignId,
  list_id: listId,
};

console.log(JSON.stringify(report, null, 2));
await c.end();
