import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../database/supabaseClient.js";
import { createPgClient, withPgTransaction } from "../database/pgClient.js";
import type {
  AuditClassification,
  AuditEntityType,
  AuditReadOnlyReport,
  AuditSummary,
  AuditTableReport,
  CleanupApplyResult,
  CleanupDryRunResult,
  ClientPurchaseAuditReport,
  ProtectedClientBundle,
} from "../types/adminDataAudit.js";
import {
  classifyByCompanyLink,
  classifyCompany,
  classifyOrder,
  classifyResult,
  emailLooksQa,
  isCleanupCandidate,
  normalizeAuditEmail,
  orderHasRealPayment,
  orderLooksQa,
  PROTECTED_CLIENT_EMAILS,
  type AuditProtectionContext,
} from "./adminDataAuditClassifier.js";
import { insertAuditLog } from "./auditLogService.js";

const SAMPLE_LIMIT = 5;
const BATCH_SIZE = 200;

const TABLE_SPECS: Array<{
  table: string;
  entityType: AuditEntityType;
  select: string;
}> = [
  { table: "companies", entityType: "company", select: "id, name, billing_email, status, created_at" },
  {
    table: "user_profiles",
    entityType: "user_profile",
    select: "id, user_id, company_id, full_name, email, role, status, created_at",
  },
  {
    table: "sms_orders",
    entityType: "sms_order",
    select:
      "id, company_id, checkout_email, payer_email, payment_status, credit_status, payment_provider, payment_reference, amount, created_at",
  },
  {
    table: "company_sms_wallets",
    entityType: "wallet",
    select: "id, company_id, available_sms, consumed_sms, status, created_at",
  },
  {
    table: "wallet_transactions",
    entityType: "wallet_transaction",
    select: "id, company_id, wallet_id, type, sms_amount, reference_type, reference_id, created_at",
  },
  {
    table: "billing_invoices",
    entityType: "billing_invoice",
    select: "id, company_id, order_id, invoice_number, status, payment_status, created_at",
  },
  {
    table: "billing_events",
    entityType: "billing_event",
    select: "id, company_id, invoice_id, event_type, description, created_at",
  },
  {
    table: "email_logs",
    entityType: "email_log",
    select: "id, company_id, order_id, recipient_email, template_key, subject, status, created_at",
  },
  {
    table: "billing_email_logs",
    entityType: "billing_email_log",
    select: "id, company_id, invoice_id, to_email, email_type, status, created_at",
  },
  {
    table: "sms_campaigns",
    entityType: "sms_campaign",
    select: "id, company_id, name, status, mode, created_at",
  },
  {
    table: "panel_sms_messages",
    entityType: "panel_sms_message",
    select: "id, company_id, campaign_id, recipient_number, status, mode, sent_at, created_at",
  },
  {
    table: "panel_sms_delivery_events",
    entityType: "panel_sms_delivery_event",
    select: "id, message_id, status, created_at",
  },
  {
    table: "sms_dlr_events",
    entityType: "sms_dlr_event",
    select: "id, sms_message_id, dlr_status, received_at",
  },
  {
    table: "sms_send_queue",
    entityType: "sms_send_queue",
    select: "id, company_id, campaign_id, message_id, status, created_at",
  },
  {
    table: "contacts",
    entityType: "contact",
    select: "id, company_id, display_name, phone, email, status, source, created_at",
  },
  {
    table: "contact_lists",
    entityType: "contact_list",
    select: "id, company_id, name, status, created_at",
  },
  {
    table: "client_support_tickets",
    entityType: "support_ticket",
    select: "id, company_id, ticket_code, subject, status, priority, created_at",
  },
  {
    table: "client_sms_templates",
    entityType: "sms_template",
    select: "id, company_id, name, category, status, created_at",
  },
  {
    table: "wholesale_providers",
    entityType: "wholesale_provider",
    select: "id, name, code, connection_type, status, created_at",
  },
  {
    table: "wholesale_customers",
    entityType: "wholesale_customer",
    select: "id, company_name, email, commercial_status, created_at",
  },
  {
    table: "wholesale_opportunities",
    entityType: "wholesale_opportunity",
    select: "id, customer_id, country_code, commercial_status, created_at",
  },
  {
    table: "wholesale_routes",
    entityType: "wholesale_route",
    select: "id, provider_id, country_code, operator_name, status, created_at",
  },
  {
    table: "sms_providers",
    entityType: "sms_provider",
    select: "id, name, code, type, status, created_at",
  },
  {
    table: "sms_rate_plans",
    entityType: "sms_rate_plan",
    select: "id, name, code, status, created_at",
  },
];

const ENTITY_TABLE_MAP: Partial<Record<AuditEntityType, string>> = Object.fromEntries(
  TABLE_SPECS.map((s) => [s.entityType, s.table]),
);

/** Tablas donde status='archived' es válido según CHECK constraints. */
const STATUS_ARCHIVE_TABLES = new Set(["contact_lists"]);

const METADATA_ARCHIVE_TABLES = new Set([
  "companies",
  "sms_campaigns",
  "contacts",
  "client_sms_templates",
  "client_support_tickets",
  "sms_orders",
]);

async function countTable(sb: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

async function sampleTable(
  sb: SupabaseClient,
  table: string,
  select: string,
  orderBy = "created_at",
): Promise<Record<string, unknown>[]> {
  const { data, error } = await sb
    .from(table)
    .select(select)
    .order(orderBy, { ascending: false })
    .limit(SAMPLE_LIMIT);
  if (error || !data) return [];
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export async function buildProtectionContext(): Promise<AuditProtectionContext> {
  const sb = getSupabase();
  const protectedCompanyIds = new Set<string>();
  const protectedOrderIds = new Set<string>();
  const companiesWithLiveSends = new Set<string>();
  const companiesWithPaidOrders = new Set<string>();
  const orphanCompanyIds = new Set<string>();

  for (const email of PROTECTED_CLIENT_EMAILS) {
    const { data: companies } = await sb
      .from("companies")
      .select("id")
      .ilike("billing_email", email);
    for (const row of companies ?? []) {
      if (row.id) protectedCompanyIds.add(String(row.id));
    }
    const { data: profiles } = await sb
      .from("user_profiles")
      .select("company_id")
      .ilike("email", email);
    for (const row of profiles ?? []) {
      if (row.company_id) protectedCompanyIds.add(String(row.company_id));
    }
    const { data: orders } = await sb
      .from("sms_orders")
      .select("id, company_id")
      .or(`checkout_email.ilike.${email},payer_email.ilike.${email}`);
    for (const row of orders ?? []) {
      if (row.id) protectedOrderIds.add(String(row.id));
      if (row.company_id) protectedCompanyIds.add(String(row.company_id));
    }
  }

  const { data: liveMsgs } = await sb
    .from("panel_sms_messages")
    .select("company_id")
    .eq("mode", "live")
    .in("status", ["sent", "delivered", "submitted"]);
  for (const row of liveMsgs ?? []) {
    if (row.company_id) {
      companiesWithLiveSends.add(String(row.company_id));
      protectedCompanyIds.add(String(row.company_id));
    }
  }

  const { data: paidOrders } = await sb
    .from("sms_orders")
    .select("id, company_id, payment_status, credit_status")
    .or("payment_status.eq.paid,credit_status.eq.credited");
  for (const row of paidOrders ?? []) {
    if (row.company_id) companiesWithPaidOrders.add(String(row.company_id));
    if (row.company_id && !orderLooksQa(row as Record<string, unknown>)) {
      protectedCompanyIds.add(String(row.company_id));
      if (row.id) protectedOrderIds.add(String(row.id));
    }
  }

  const { data: allCompanies } = await sb.from("companies").select("id");
  const companyIdSet = new Set((allCompanies ?? []).map((r) => String(r.id)));

  const tablesWithCompany = [
    "sms_orders",
    "company_sms_wallets",
    "panel_sms_messages",
    "contacts",
  ] as const;

  for (const table of tablesWithCompany) {
    const { data } = await sb.from(table).select("company_id").not("company_id", "is", null);
    for (const row of data ?? []) {
      const cid = String(row.company_id);
      if (!companyIdSet.has(cid)) orphanCompanyIds.add(cid);
    }
  }

  return {
    protectedCompanyIds,
    protectedOrderIds,
    companiesWithLiveSends,
    companiesWithPaidOrders,
    orphanCompanyIds,
  };
}

function classifyGenericRow(
  entityType: AuditEntityType,
  row: Record<string, unknown>,
  ctx: AuditProtectionContext,
): ReturnType<typeof classifyResult> {
  switch (entityType) {
    case "company":
      return classifyCompany(row, ctx);
    case "sms_order":
      return classifyOrder(row, ctx);
    case "user_profile": {
      const email = normalizeAuditEmail(row.email);
      if (PROTECTED_CLIENT_EMAILS.has(email)) {
        return classifyResult("PROD_REAL", "Perfil cliente real protegido", 1, true);
      }
      if (emailLooksQa(email)) {
        return classifyResult("QA_TEST", "Email de prueba", 0.9, false);
      }
      return classifyByCompanyLink(
        row.company_id ? String(row.company_id) : null,
        ctx,
      );
    }
    case "wallet":
    case "wallet_transaction":
    case "billing_invoice":
    case "billing_event":
    case "email_log":
    case "billing_email_log":
    case "sms_campaign":
    case "panel_sms_message":
    case "sms_send_queue":
    case "contact":
    case "contact_list":
    case "support_ticket":
    case "sms_template":
      return classifyByCompanyLink(
        row.company_id ? String(row.company_id) : null,
        ctx,
        {
          mode: typeof row.mode === "string" ? row.mode : undefined,
          status: typeof row.status === "string" ? row.status : undefined,
        },
      );
    case "panel_sms_delivery_event":
      return classifyResult("REVIEW_REQUIRED", "DLR panel — revisar por message_id", 0.5, false);
    case "sms_dlr_event":
      return classifyResult("REVIEW_REQUIRED", "DLR legacy", 0.5, false);
    case "wholesale_provider":
    case "wholesale_customer":
    case "wholesale_opportunity":
    case "wholesale_route":
    case "sms_provider":
    case "sms_rate_plan":
      return classifyResult("PROD_INTERNAL", "Infraestructura Telvoice", 0.85, true);
    default:
      return classifyResult("REVIEW_REQUIRED", "Sin clasificador", 0.3, false);
  }
}

export async function generateReadOnlyAuditReport(): Promise<AuditReadOnlyReport> {
  const sb = getSupabase();
  const ctx = await buildProtectionContext();
  const tables: AuditTableReport[] = [];
  const classificationPreview: Record<AuditClassification, number> = {
    PROD_REAL: 0,
    PROD_INTERNAL: 0,
    QA_TEST: 0,
    DEMO_SEED: 0,
    ORPHAN: 0,
    REVIEW_REQUIRED: 0,
  };

  for (const spec of TABLE_SPECS) {
    const total = await countTable(sb, spec.table);
    const orderBy = spec.table === "sms_dlr_events" ? "received_at" : "created_at";
    const samples = await sampleTable(sb, spec.table, spec.select, orderBy);
    tables.push({ table: spec.table, entityType: spec.entityType, total, samples });

    const { data } = await sb.from(spec.table).select("*").limit(500);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const c = classifyGenericRow(spec.entityType, row, ctx);
      classificationPreview[c.classification] += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tables,
    classificationPreview,
  };
}

async function upsertAuditFlag(input: {
  entityType: AuditEntityType;
  entityId: string;
  classification: AuditClassification;
  reason: string;
  confidence: number;
  protected: boolean;
}): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("admin_data_audit_flags").upsert(
    {
      entity_type: input.entityType,
      entity_id: input.entityId,
      classification: input.classification,
      reason: input.reason,
      confidence: input.confidence,
      protected: input.protected,
      metadata: { source: "auto_classifier", generated_at: new Date().toISOString() },
    },
    { onConflict: "entity_type,entity_id" },
  );
  if (error) throw error;
}

export async function generateAuditFlags(actorEmail?: string): Promise<{
  inserted: number;
  byClassification: Record<AuditClassification, number>;
}> {
  const sb = getSupabase();
  const ctx = await buildProtectionContext();
  const byClassification: Record<AuditClassification, number> = {
    PROD_REAL: 0,
    PROD_INTERNAL: 0,
    QA_TEST: 0,
    DEMO_SEED: 0,
    ORPHAN: 0,
    REVIEW_REQUIRED: 0,
  };
  let inserted = 0;

  for (const spec of TABLE_SPECS) {
    let offset = 0;
    for (;;) {
      const { data, error } = await sb
        .from(spec.table)
        .select("*")
        .range(offset, offset + BATCH_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      if (rows.length === 0) break;

      for (const row of rows) {
        const id = String(row.id ?? "");
        if (!id) continue;
        const c = classifyGenericRow(spec.entityType, row, ctx);
        await upsertAuditFlag({
          entityType: spec.entityType,
          entityId: id,
          classification: c.classification,
          reason: c.reason,
          confidence: c.confidence,
          protected: c.protected,
        });
        byClassification[c.classification] += 1;
        inserted += 1;
      }
      if (rows.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
  }

  await insertAuditLog({
    actorRole: "superadmin",
    action: "admin_data_audit.generate",
    entityType: "admin_data_audit_flags",
    metadata: { inserted, byClassification, actorEmail: actorEmail ?? null },
  });

  return { inserted, byClassification };
}

async function fetchFlagAggregateCounts(): Promise<{
  flagCounts: Record<AuditClassification, number>;
  totalProtected: number;
  totalArchived: number;
  totalFlags: number;
  lastAuditAt: string | null;
}> {
  const flagCounts: Record<AuditClassification, number> = {
    PROD_REAL: 0,
    PROD_INTERNAL: 0,
    QA_TEST: 0,
    DEMO_SEED: 0,
    ORPHAN: 0,
    REVIEW_REQUIRED: 0,
  };

  const client = createPgClient();
  await client.connect();
  try {
    const { rows: classRows } = await client.query(`
      SELECT classification, COUNT(*)::int AS n
      FROM admin_data_audit_flags
      GROUP BY classification
    `);
    for (const row of classRows) {
      const classification = String(row.classification ?? "") as AuditClassification;
      if (classification in flagCounts) {
        flagCounts[classification] = Number(row.n ?? 0);
      }
    }

    const { rows: protRows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM admin_data_audit_flags WHERE protected = true`,
    );
    const { rows: archRows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM admin_data_audit_flags WHERE archived_at IS NOT NULL`,
    );
    const { rows: lastRows } = await client.query(
      `SELECT MAX(created_at) AS last_at FROM admin_data_audit_flags`,
    );

    const totalFlags = Object.values(flagCounts).reduce((sum, n) => sum + n, 0);

    return {
      flagCounts,
      totalProtected: Number(protRows[0]?.n ?? 0),
      totalArchived: Number(archRows[0]?.n ?? 0),
      totalFlags,
      lastAuditAt: lastRows[0]?.last_at ? String(lastRows[0].last_at) : null,
    };
  } finally {
    await client.end();
  }
}

export async function getAuditSummary(): Promise<AuditSummary> {
  const sb = getSupabase();
  const [
    companies,
    realClients,
    realOrders,
    qaOrders,
    realWallets,
    realMessages,
    qaMessages,
    aggregates,
  ] = await Promise.all([
    countTable(sb, "companies"),
    sb
      .from("admin_data_audit_flags")
      .select("*", { count: "exact", head: true })
      .eq("entity_type", "company")
      .eq("classification", "PROD_REAL"),
    sb
      .from("admin_data_audit_flags")
      .select("*", { count: "exact", head: true })
      .eq("entity_type", "sms_order")
      .eq("classification", "PROD_REAL"),
    sb
      .from("admin_data_audit_flags")
      .select("*", { count: "exact", head: true })
      .eq("entity_type", "sms_order")
      .eq("classification", "QA_TEST"),
    sb
      .from("admin_data_audit_flags")
      .select("*", { count: "exact", head: true })
      .eq("entity_type", "wallet")
      .eq("classification", "PROD_REAL"),
    sb
      .from("admin_data_audit_flags")
      .select("*", { count: "exact", head: true })
      .eq("entity_type", "panel_sms_message")
      .eq("classification", "PROD_REAL"),
    sb
      .from("admin_data_audit_flags")
      .select("*", { count: "exact", head: true })
      .eq("entity_type", "panel_sms_message")
      .eq("classification", "QA_TEST"),
    fetchFlagAggregateCounts(),
  ]);

  const { flagCounts, totalProtected, totalArchived, totalFlags, lastAuditAt } = aggregates;

  return {
    totalCompanies: companies,
    totalRealClients: realClients.count ?? 0,
    totalRealOrders: realOrders.count ?? 0,
    totalQaOrders: qaOrders.count ?? 0,
    totalRealWallets: realWallets.count ?? 0,
    totalRealMessages: realMessages.count ?? 0,
    totalQaMessages: qaMessages.count ?? 0,
    totalOrphans: flagCounts.ORPHAN,
    totalReviewRequired: flagCounts.REVIEW_REQUIRED,
    totalFlags,
    totalProtected,
    totalArchived,
    lastAuditAt,
    flagCounts,
  };
}

export async function getCleanupCandidates(limit = 100): Promise<
  Array<{
    entity_type: AuditEntityType;
    entity_id: string;
    classification: AuditClassification;
    reason: string | null;
    confidence: number;
  }>
> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("admin_data_audit_flags")
    .select("entity_type, entity_id, classification, reason, confidence")
    .eq("protected", false)
    .in("classification", ["QA_TEST", "DEMO_SEED", "ORPHAN"])
    .is("archived_at", null)
    .order("confidence", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Array<{
    entity_type: AuditEntityType;
    entity_id: string;
    classification: AuditClassification;
    reason: string | null;
    confidence: number;
  }>;
}

export async function getProtectedClientBundle(
  email = "arturo.aguilar@talkchile.cl",
): Promise<ProtectedClientBundle> {
  const sb = getSupabase();
  const normalized = normalizeAuditEmail(email);

  const { data: profiles } = await sb
    .from("user_profiles")
    .select("*")
    .ilike("email", normalized)
    .limit(1);
  const profile = profiles?.[0] ?? null;

  let company: Record<string, unknown> | null = null;
  if (profile?.company_id) {
    const { data } = await sb
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .maybeSingle();
    company = (data as Record<string, unknown>) ?? null;
  }
  if (!company) {
    const { data } = await sb
      .from("companies")
      .select("*")
      .ilike("billing_email", normalized)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    company = (data as Record<string, unknown>) ?? null;
  }

  const companyId = company?.id ? String(company.id) : profile?.company_id ?? null;

  const ordersQ = companyId
    ? sb.from("sms_orders").select("*").eq("company_id", companyId)
    : sb
        .from("sms_orders")
        .select("*")
        .or(`checkout_email.ilike.${normalized},payer_email.ilike.${normalized}`);
  const { data: orders } = await ordersQ.order("created_at", { ascending: false });

  const wallets = companyId
    ? (await sb.from("company_sms_wallets").select("*").eq("company_id", companyId)).data ?? []
    : [];

  const walletTx = companyId
    ? (
        await sb
          .from("wallet_transactions")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];

  const orderIds = (orders ?? []).map((o) => String(o.id));
  const invoices =
    orderIds.length > 0
      ? (
          await sb
            .from("billing_invoices")
            .select("*")
            .in("order_id", orderIds)
        ).data ?? []
      : companyId
        ? (await sb.from("billing_invoices").select("*").eq("company_id", companyId)).data ?? []
        : [];

  const emailLogs = companyId
    ? (
        await sb
          .from("email_logs")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];

  const billingEmailLogs =
    invoices.length > 0
      ? (
          await sb
            .from("billing_email_logs")
            .select("*")
            .in(
              "invoice_id",
              invoices.map((i) => i.id),
            )
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

  const messages = companyId
    ? (
        await sb
          .from("panel_sms_messages")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50)
      ).data ?? []
    : [];

  const messageIds = messages.map((m) => String(m.id));
  const deliveryEvents =
    messageIds.length > 0
      ? (
          await sb
            .from("panel_sms_delivery_events")
            .select("*")
            .in("message_id", messageIds)
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

  return {
    email: normalized,
    fullName: profile?.full_name ?? (company?.name as string) ?? null,
    company: company as Record<string, unknown> | null,
    userProfile: profile as Record<string, unknown> | null,
    orders: (orders ?? []) as Record<string, unknown>[],
    wallets: wallets as Record<string, unknown>[],
    walletTransactions: walletTx as Record<string, unknown>[],
    invoices: invoices as Record<string, unknown>[],
    emailLogs: emailLogs as Record<string, unknown>[],
    billingEmailLogs: billingEmailLogs as Record<string, unknown>[],
    messages: messages as Record<string, unknown>[],
    deliveryEvents: deliveryEvents as Record<string, unknown>[],
    messageCount: messages.length,
    emailCount: billingEmailLogs.length + emailLogs.length,
  };
}

export async function getClientPurchaseAuditReport(
  email = "arturo.aguilar@talkchile.cl",
): Promise<ClientPurchaseAuditReport> {
  const bundle = await getProtectedClientBundle(email);
  const sb = getSupabase();
  const issues: string[] = [];
  const timeline: ClientPurchaseAuditReport["timeline"] = [];

  const order = bundle.orders[0] ?? null;
  const orderId = order?.id ? String(order.id) : null;
  const companyId = bundle.company?.id ? String(bundle.company.id) : null;

  const billingEvents = orderId
    ? (
        await sb
          .from("billing_events")
          .select("*")
          .eq("company_id", companyId ?? "")
          .order("created_at", { ascending: true })
      ).data ?? []
    : [];

  const webhookErrors = billingEvents.filter(
    (e) =>
      String(e.event_type ?? "").includes("failed") ||
      String(e.event_type ?? "").includes("webhook") ||
      String(e.description ?? "").toLowerCase().includes("error"),
  );

  const purchaseCredits = bundle.walletTransactions.filter(
    (t) => t.type === "purchase_credit",
  );
  const receiptEmails = bundle.billingEmailLogs.filter(
    (e) =>
      String(e.email_type ?? "purchase_receipt") === "purchase_receipt" &&
      ["sent", "sending"].includes(String(e.status ?? "")),
  );
  const mpEvents = billingEvents.filter((e) =>
    String(e.event_type ?? "").toLowerCase().includes("mercadopago"),
  );

  const duplicateCredits = purchaseCredits.length > 1;
  const duplicateInvoices = bundle.invoices.length > 1;
  const duplicateReceiptEmails = receiptEmails.length > 1;
  const duplicateMp = mpEvents.length > 1;
  const walletCreditedOnce = purchaseCredits.length === 1;
  const idempotencyOk =
    !duplicateReceiptEmails && !duplicateCredits && !duplicateInvoices;
  const clientActivated =
    bundle.userProfile?.status === "active" &&
    (order?.claim_status === "claimed" || order?.credit_status === "credited");

  if (duplicateCredits) issues.push("Más de un purchase_credit en wallet.");
  if (duplicateInvoices) issues.push("Más de una invoice para la misma compra.");
  if (duplicateReceiptEmails) issues.push("Posible duplicación de comprobante por email.");
  if (duplicateMp) issues.push("MercadoPago notificó más de una vez (revisar eventos).");
  if (!walletCreditedOnce && purchaseCredits.length > 0) {
    issues.push("Wallet no acreditado exactamente una vez.");
  }
  if (!clientActivated) issues.push("Cliente u orden no completamente activados.");

  for (const o of bundle.orders) {
    timeline.push({
      at: String(o.created_at ?? ""),
      kind: "order",
      label: `Orden ${String(o.id).slice(0, 8)}`,
      detail: `${o.payment_status}/${o.credit_status}`,
    });
  }
  for (const t of purchaseCredits) {
    timeline.push({
      at: String(t.created_at ?? ""),
      kind: "wallet_credit",
      label: "Crédito wallet",
      detail: `${t.sms_amount} SMS`,
    });
  }
  for (const inv of bundle.invoices) {
    timeline.push({
      at: String(inv.created_at ?? ""),
      kind: "invoice",
      label: `Invoice ${inv.invoice_number ?? inv.id}`,
      detail: String(inv.payment_status ?? inv.status ?? ""),
    });
  }
  for (const e of bundle.billingEmailLogs) {
    timeline.push({
      at: String(e.created_at ?? ""),
      kind: "billing_email",
      label: String(e.subject ?? e.email_type ?? "comprobante"),
      detail: String(e.status ?? ""),
    });
  }
  for (const m of bundle.messages) {
    timeline.push({
      at: String(m.sent_at ?? m.created_at ?? ""),
      kind: "sms",
      label: `SMS → ${m.recipient_number}`,
      detail: String(m.status ?? ""),
    });
  }
  for (const e of bundle.deliveryEvents) {
    timeline.push({
      at: String(e.created_at ?? ""),
      kind: "dlr",
      label: "DLR",
      detail: String(e.status ?? ""),
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  return {
    email: bundle.email,
    generatedAt: new Date().toISOString(),
    profile: bundle.userProfile,
    company: bundle.company,
    orders: bundle.orders,
    payment: {
      duplicateMercadoPagoNotifications: duplicateMp,
      mercadoPagoNotificationCount: mpEvents.length,
      duplicateCredits,
      purchaseCreditCount: purchaseCredits.length,
      duplicateInvoices,
      invoiceCount: bundle.invoices.length,
      duplicateReceiptEmails,
      receiptEmailCount: receiptEmails.length,
      idempotencyOk,
      walletCreditedOnce,
      clientActivated,
    },
    wallet: bundle.wallets[0] ?? null,
    walletTransactions: bundle.walletTransactions,
    invoices: bundle.invoices,
    emailLogs: bundle.emailLogs,
    billingEmailLogs: bundle.billingEmailLogs,
    billingEvents: billingEvents as Record<string, unknown>[],
    messages: bundle.messages,
    deliveryEvents: bundle.deliveryEvents,
    webhookErrors: webhookErrors as Record<string, unknown>[],
    timeline,
    issues,
    ok: issues.length === 0,
  };
}

function archiveActionForTable(table: string): CleanupDryRunResult["archiveCandidates"][0]["action"] {
  if (STATUS_ARCHIVE_TABLES.has(table)) return "archive_status";
  if (METADATA_ARCHIVE_TABLES.has(table)) return "archive_metadata";
  return "flag_only";
}

export async function dryRunCleanup(): Promise<CleanupDryRunResult> {
  const sb = getSupabase();
  const { data: flags, error } = await sb
    .from("admin_data_audit_flags")
    .select("*")
    .eq("protected", false)
    .is("archived_at", null);
  if (error) throw error;

  const archiveCandidates: CleanupDryRunResult["archiveCandidates"] = [];
  const hardDeleteCandidates: CleanupDryRunResult["hardDeleteCandidates"] = [];
  let skippedProtected = 0;
  let skippedLowConfidence = 0;

  for (const flag of flags ?? []) {
    if (flag.protected) {
      skippedProtected += 1;
      continue;
    }
    const classification = flag.classification as AuditClassification;
    if (!isCleanupCandidate(classification)) continue;

    const table = ENTITY_TABLE_MAP[flag.entity_type as AuditEntityType];
    if (!table) continue;

    archiveCandidates.push({
      entityType: flag.entity_type as AuditEntityType,
      entityId: flag.entity_id,
      classification,
      reason: flag.reason,
      action: archiveActionForTable(table),
    });

    const confidence = Number(flag.confidence ?? 0);
    const reviewed = Boolean(flag.reviewed);
    if (confidence < 0.95) {
      skippedLowConfidence += 1;
      continue;
    }

    let allowHard = false;
    if (classification === "DEMO_SEED") {
      allowHard = true;
    } else if (classification === "QA_TEST") {
      if (flag.entity_type === "sms_order") {
        const { data: order } = await sb
          .from("sms_orders")
          .select("payment_status, credit_status, metadata, payment_reference")
          .eq("id", flag.entity_id)
          .maybeSingle();
        allowHard = !order || !orderHasRealPayment(order as Record<string, unknown>);
      } else {
        allowHard = true;
      }
    } else if (classification === "ORPHAN") {
      allowHard = reviewed;
    }

    if (allowHard) {
      hardDeleteCandidates.push({
        entityType: flag.entity_type as AuditEntityType,
        entityId: flag.entity_id,
        classification,
        reason: flag.reason,
        table,
      });
    } else {
      skippedLowConfidence += 1;
    }
  }

  return { archiveCandidates, hardDeleteCandidates, skippedProtected, skippedLowConfidence };
}

export async function applyCleanup(input: {
  confirmation: string;
  actorEmail: string;
}): Promise<CleanupApplyResult> {
  if (input.confirmation !== "LIMPIAR SOLO DATOS QA") {
    throw new Error("Confirmación incorrecta. Escribe exactamente: LIMPIAR SOLO DATOS QA");
  }

  const dry = await dryRunCleanup();
  let archived = 0;
  let hardDeleted = 0;
  const errors: string[] = [];
  let skippedProtected = dry.skippedProtected;

  await withPgTransaction(async (client) => {
    for (const item of dry.archiveCandidates) {
      const { rows } = await client.query(
        `SELECT protected FROM admin_data_audit_flags
         WHERE entity_type = $1 AND entity_id = $2 FOR UPDATE`,
        [item.entityType, item.entityId],
      );
      const flag = rows[0];
      if (!flag || flag.protected) {
        skippedProtected += 1;
        continue;
      }

      const table = ENTITY_TABLE_MAP[item.entityType];
      const archiveMeta = JSON.stringify({
        audit_archived_at: new Date().toISOString(),
        audit_archived_by: input.actorEmail,
      });
      if (table && item.action === "archive_status" && STATUS_ARCHIVE_TABLES.has(table)) {
        await client.query(
          `UPDATE ${table}
           SET status = 'archived',
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
           WHERE id = $1::uuid`,
          [item.entityId, archiveMeta],
        );
      } else if (table && item.action === "archive_metadata" && METADATA_ARCHIVE_TABLES.has(table)) {
        await client.query(
          `UPDATE ${table}
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
           WHERE id = $1::uuid`,
          [item.entityId, archiveMeta],
        );
      }

      await client.query(
        `UPDATE admin_data_audit_flags
         SET archived_at = now(),
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE entity_type = $1 AND entity_id = $3 AND protected = false`,
        [
          item.entityType,
          JSON.stringify({ archived_by: input.actorEmail }),
          item.entityId,
        ],
      );
      archived += 1;
    }

    for (const item of dry.hardDeleteCandidates) {
      const { rows } = await client.query(
        `SELECT protected, confidence, classification, reviewed
         FROM admin_data_audit_flags
         WHERE entity_type = $1 AND entity_id = $2 FOR UPDATE`,
        [item.entityType, item.entityId],
      );
      const flag = rows[0];
      if (!flag || flag.protected) {
        skippedProtected += 1;
        continue;
      }
      if (Number(flag.confidence) < 0.95) continue;
      if (flag.classification === "QA_TEST" && !flag.reviewed) continue;

      try {
        await client.query(`DELETE FROM ${item.table} WHERE id = $1::uuid`, [item.entityId]);
        await client.query(
          `DELETE FROM admin_data_audit_flags WHERE entity_type = $1 AND entity_id = $2`,
          [item.entityType, item.entityId],
        );
        hardDeleted += 1;
      } catch (err) {
        errors.push(`${item.entityType}/${item.entityId}: ${(err as Error).message}`);
      }
    }
  });

  await insertAuditLog({
    actorRole: "superadmin",
    action: "admin_data_audit.cleanup_apply",
    entityType: "admin_data_audit_flags",
    metadata: { archived, hardDeleted, skippedProtected, errors, actorEmail: input.actorEmail },
  });

  return { archived, hardDeleted, skippedProtected, errors };
}

/** Verifica conexión pg (para health en UI). */
export async function pingAuditDatabase(): Promise<boolean> {
  const client = createPgClient();
  await client.connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    await client.end();
  }
}
