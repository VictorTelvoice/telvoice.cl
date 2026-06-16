#!/usr/bin/env node
/**
 * Habilitación API manual — felipevalenciao@gmail.com / TLV-1001
 * Uso: npx tsx scripts/enable-api-felipe-tlv1001.mjs
 */
import "dotenv/config";
import pg from "pg";
import { getSupabase } from "../src/database/supabaseClient.ts";
import { markEntityAsProdReal } from "../src/services/adminDataAuditService.ts";
import {
  activateClientApiKey,
  approveProductionApiKey,
  authenticateClientApiKey,
  createClientApiKey,
  listClientApiKeys,
} from "../src/services/clientApiKeyService.ts";
import {
  addAdminSupportTicketReply,
  updateSupportTicketAdmin,
} from "../src/services/clientSupportTicketService.ts";
import { updateCompanyRatePlanTraffic } from "../src/services/companyRatePlanService.ts";
import { readCompanyBalance } from "../src/services/smsWalletService.ts";

const COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";
const EMAIL = "felipevalenciao@gmail.com";
const TICKET_CODE = "TLV-1001";
const ORDER_ID = "33545733-7af1-4387-96e3-f5a86bc2111e";
const RETAIL_PLAN = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";

const CUSTOMER_REPLY = `Hola Felipe, ya dejamos habilitado el acceso API para tu cuenta. Puedes ingresar al panel Telvoice y revisar la sección API, donde encontrarás las credenciales y la documentación para comenzar a integrar tus envíos. Tu bolsa de 1.000 SMS se mantiene activa y asociada al plan TELVOICE CL Retail.

Quedamos atentos si necesitas apoyo con la integración o con una prueba de envío.`;

async function pgSnapshot(label) {
  const cs = process.env.DATABASE_URL?.trim();
  const c = new pg.Client({
    connectionString: cs,
    ssl: cs?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  try {
    const company = (
      await c.query(`SELECT id, billing_email, status FROM companies WHERE id = $1`, [
        COMPANY_ID,
      ])
    ).rows[0];
    const wallet = (
      await c.query(
        `SELECT available_sms, reserved_sms, status FROM company_sms_wallets WHERE company_id = $1`,
        [COMPANY_ID],
      )
    ).rows[0];
    const purchaseCredits = (
      await c.query(
        `SELECT count(*)::int c FROM wallet_transactions WHERE company_id = $1 AND type = 'purchase_credit'`,
        [COMPANY_ID],
      )
    ).rows[0]?.c;
    const ratePlans = (
      await c.query(
        `SELECT traffic_type, api_enabled, campaigns_enabled, live_enabled, rate_plan_id, status
         FROM company_rate_plans WHERE company_id = $1 AND country = 'CL'`,
        [COMPANY_ID],
      )
    ).rows;
    const apiKeys = (
      await c.query(
        `SELECT id, name, key_prefix, key_masked, status, environment, production_approved, scopes, source
         FROM client_api_keys WHERE company_id = $1 ORDER BY created_at`,
        [COMPANY_ID],
      )
    ).rows;
    const auditFlag = (
      await c.query(
        `SELECT classification, reason, protected FROM admin_data_audit_flags
         WHERE entity_type = 'company' AND entity_id = $1 AND archived_at IS NULL`,
        [COMPANY_ID],
      )
    ).rows[0];
    const ticket = (
      await c.query(
        `SELECT id, ticket_code, status, priority, subject FROM client_support_tickets
         WHERE company_id = $1 AND ticket_code = $2`,
        [COMPANY_ID, TICKET_CODE],
      )
    ).rows[0];
    return { label, company, wallet, purchaseCredits, ratePlans, apiKeys, auditFlag, ticket };
  } finally {
    await c.end();
  }
}

async function resolveAdminActor() {
  const { data } = await getSupabase()
    .from("admin_users")
    .select("id, email, name, role")
    .eq("role", "superadmin")
    .limit(1)
    .maybeSingle();
  if (!data) {
    throw new Error("No se encontró superadmin para aprobar API production");
  }
  return {
    adminId: String(data.id),
    adminEmail: String(data.email),
    adminName: String(data.name ?? "Telvoice Support"),
  };
}

async function main() {
  const report = {
    companyId: COMPANY_ID,
    email: EMAIL,
    ticketCode: TICKET_CODE,
    before: null,
    after: null,
    actions: [],
    apiKeyId: null,
    apiKeyPrefix: null,
    apiKeyCreated: false,
    apiKeyActivated: false,
    apiKeyApproved: false,
    apiAuthTest: null,
    balanceTest: null,
    prodRealApplied: false,
    ticketUpdated: false,
    errors: [],
  };

  report.before = await pgSnapshot("before");
  console.log(JSON.stringify({ phase: "before", summary: report.before }, null, 2));

  // 1. Habilitar api_enabled en rate plans
  try {
    await updateCompanyRatePlanTraffic(COMPANY_ID, {
      apiEnabled: true,
      country: "CL",
      applyToAllTrafficTypes: true,
    });
    report.actions.push("api_enabled=true en company_rate_plans CL");
  } catch (e) {
    report.errors.push(`api_enabled: ${e instanceof Error ? e.message : e}`);
  }

  // 2. API keys
  let plainKeyForTest = null;
  try {
    const listed = await listClientApiKeys(COMPANY_ID);
    const keys = listed.ok ? (listed.data ?? []) : [];
    let prodKey = keys.find(
      (k) => k.environment === "production" && k.status !== "revoked",
    );

    if (!prodKey) {
      const created = await createClientApiKey({
        companyId: COMPANY_ID,
        name: `API TLV-1001 ${new Date().toISOString().slice(0, 10)}`,
        scopes: ["balance:read", "messages:read", "sms:send"],
        environment: "production",
      });
      if (!created.ok || !created.data) {
        throw new Error(created.error ?? "createClientApiKey failed");
      }
      prodKey = created.data.key;
      plainKeyForTest = created.data.plainTextKey;
      report.apiKeyCreated = true;
      report.actions.push("created production API key");

      await getSupabase()
        .from("client_api_keys")
        .update({
          source: "manual_support_activation",
          metadata: {
            ticket_code: TICKET_CODE,
            order_id: ORDER_ID,
            support_activation: true,
            activated_at: new Date().toISOString(),
          },
        })
        .eq("id", prodKey.id);
    } else if (prodKey.status === "paused") {
      const act = await activateClientApiKey(prodKey.id, COMPANY_ID);
      if (act.ok) {
        report.apiKeyActivated = true;
        report.actions.push("activated paused API key");
        prodKey = act.data ?? prodKey;
      }
    }

    report.apiKeyId = prodKey.id;
    report.apiKeyPrefix = prodKey.keyPrefix;

    if (!prodKey.productionApproved) {
      const admin = await resolveAdminActor();
      const approved = await approveProductionApiKey(
        prodKey.id,
        admin,
        `TLV-1001 manual API activation for ${EMAIL}`,
      );
      if (!approved.ok) {
        throw new Error(approved.error ?? "approveProductionApiKey failed");
      }
      report.apiKeyApproved = true;
      report.actions.push("production_approved=true");
    } else {
      report.actions.push("production already approved");
    }
  } catch (e) {
    report.errors.push(`api_keys: ${e instanceof Error ? e.message : e}`);
  }

  // 3. PROD_REAL
  try {
    await markEntityAsProdReal({
      entityType: "company",
      entityId: COMPANY_ID,
      reason: "MercadoPago approved, credited and API requested by customer",
      metadata: {
        source: "manual_support_review",
        order_id: ORDER_ID,
        ticket_code: TICKET_CODE,
      },
    });
    await markEntityAsProdReal({
      entityType: "sms_order",
      entityId: ORDER_ID,
      reason: "MercadoPago approved, credited and API requested by customer",
      metadata: {
        source: "manual_support_review",
        ticket_code: TICKET_CODE,
      },
    });
    report.prodRealApplied = true;
    report.actions.push("PROD_REAL company + order");
  } catch (e) {
    report.errors.push(`prod_real: ${e instanceof Error ? e.message : e}`);
  }

  // 4. Ticket TLV-1001
  try {
    const ticketId = report.before?.ticket?.id;
    if (!ticketId) {
      report.errors.push(`ticket ${TICKET_CODE} not found in DB`);
    } else {
      const admin = await resolveAdminActor();
      const actor = {
        adminId: admin.adminId,
        adminEmail: admin.adminEmail,
        adminName: admin.adminName,
      };
      const reply = await addAdminSupportTicketReply(
        ticketId,
        CUSTOMER_REPLY,
        "Equipo Telvoice",
        actor,
      );
      if (!reply.ok) {
        report.errors.push(`ticket_reply: ${reply.error}`);
      } else {
        report.actions.push("ticket public reply added");
      }
      const resolved = await updateSupportTicketAdmin(
        ticketId,
        { status: "resolved", priority: "medium" },
        actor,
      );
      if (!resolved.ok) {
        report.errors.push(`ticket_resolve: ${resolved.error}`);
      } else {
        report.ticketUpdated = true;
        report.actions.push("ticket resolved + priority medium");
      }
    }
  } catch (e) {
    report.errors.push(`ticket: ${e instanceof Error ? e.message : e}`);
  }

  // 5. Validación auth + balance (sin SMS)
  if (plainKeyForTest) {
    try {
      const auth = await authenticateClientApiKey(
        `Bearer ${plainKeyForTest}`,
        "balance:read",
      );
      report.apiAuthTest = {
        ok: auth.ok,
        code: auth.ok ? null : auth.code,
        companyId: auth.ok ? auth.context.companyId : auth.resolved?.companyId,
        productionApproved: auth.ok ? auth.context.productionApproved : null,
      };
      if (auth.ok) {
        const bal = await readCompanyBalance(COMPANY_ID);
        report.balanceTest = {
          availableSms: bal.availableSms,
          reservedSms: bal.reservedSms,
        };
      }
    } catch (e) {
      report.errors.push(`auth_test: ${e instanceof Error ? e.message : e}`);
    }
  } else if (report.apiKeyPrefix) {
    report.apiAuthTest = {
      skipped: true,
      reason: "existing_key_secret_not_recoverable_use_panel_regenerate",
    };
  }

  report.after = await pgSnapshot("after");

  const out = {
    ...report,
    api_enabled_after: report.after?.ratePlans?.every((r) => r.api_enabled),
    wallet_unchanged:
      report.before?.wallet?.available_sms === report.after?.wallet?.available_sms,
    purchase_credit_count_unchanged:
      report.before?.purchaseCredits === report.after?.purchaseCredits,
    retail_plan_ok: report.after?.ratePlans?.every(
      (r) => r.rate_plan_id === RETAIL_PLAN,
    ),
  };

  console.log(JSON.stringify({ phase: "result", ...out }, null, 2));

  if (report.errors.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
