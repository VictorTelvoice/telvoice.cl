import { getSupabase } from "../database/supabaseClient.js";
import type {
  BillingInvoice,
  BillingInvoiceStatus,
  BillingInvoiceWithDetails,
  BillingInvoiceItem,
  BillingEvent,
  BillingEmailLog,
  InvoiceListFilters,
  CreateInvoiceForOrderInput,
  BillingSummary,
  AdminInvoiceSummary,
  AdminInvoiceDetail,
  AdminInvoiceListFilters,
  AdminInvoiceListRow,
} from "../types/billing.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { getOrderById } from "./smsOrderService.js";
import { findCompanyById } from "./companyService.js";
import { isDuplicateKeyError } from "../utils/supabase-errors.js";
import { createItemsForInvoiceFromOrder } from "./billingInvoiceItemService.js";
import { recordBillingEvent } from "./billingEventService.js";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function pad6(n: number): string {
  return String(n).padStart(6, "0");
}

function formatYyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function buildReceiptNumber(orderId: string, attempt = 0): string {
  // Número interno NO tributario: TV-RCPT-YYYYMMDD-<6 chars>
  const stamp = formatYyyymmdd(new Date());
  const compact = orderId.replaceAll("-", "");
  const base = compact.slice(-6).toUpperCase();
  const suffix =
    attempt > 0
      ? `${base.slice(0, 4)}${pad6(Math.floor(Math.random() * 1000000)).slice(0, 2)}`
      : base;
  return `TV-RCPT-${stamp}-${suffix}`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getInvoiceByOrderId(
  orderId: string,
): Promise<BillingInvoice | null> {
  const { data, error } = await getSupabase()
    .from("billing_invoices")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    console.warn("[billing] getInvoiceByOrderId failed", error);
    return null;
  }
  return (data as BillingInvoice | null) ?? null;
}

function mapInvoiceWithDetails(row: Record<string, unknown>): BillingInvoiceWithDetails {
  const base = row as unknown as BillingInvoice;
  return {
    ...base,
    items: (row.billing_invoice_items ?? []) as BillingInvoiceItem[],
    events: (row.billing_events ?? []) as BillingEvent[],
    email_logs: (row.billing_email_logs ?? []) as BillingEmailLog[],
  };
}

export async function getInvoiceById(
  invoiceId: string,
): Promise<BillingInvoiceWithDetails | null> {
  const { data, error } = await getSupabase()
    .from("billing_invoices")
    .select(
      `
      *,
      billing_invoice_items (*),
      billing_events (*),
      billing_email_logs (*)
    `,
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    console.warn("[billing] getInvoiceById failed", error);
    return null;
  }
  if (!data) {
    return null;
  }
  return mapInvoiceWithDetails(data as Record<string, unknown>);
}

/** Solo retorna el documento si pertenece a la empresa (multi-tenant). */
export async function getCompanyInvoiceById(
  companyId: string,
  invoiceId: string,
): Promise<BillingInvoiceWithDetails | null> {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice || invoice.company_id !== companyId) {
    return null;
  }
  return invoice;
}

export function summarizeCompanyInvoices(invoices: BillingInvoice[]): BillingSummary & {
  issuedCount: number;
  sentCount: number;
  pendingCount: number;
  failedCount: number;
  lastDocumentAt: string | null;
} {
  const byStatus: Record<string, number> = {};
  let totalAmount = 0;
  let issuedCount = 0;
  let sentCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let lastDocumentAt: string | null = null;

  for (const inv of invoices) {
    totalAmount += toNumber(inv.total_amount);
    byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;

    if (["issued", "sent", "paid"].includes(inv.status)) {
      issuedCount += 1;
    }
    if (inv.status === "sent") {
      sentCount += 1;
    }
    if (inv.status === "draft" || inv.status === "pending_issue") {
      pendingCount += 1;
    }
    if (inv.status === "failed") {
      failedCount += 1;
    }
    if (!lastDocumentAt || inv.created_at > lastDocumentAt) {
      lastDocumentAt = inv.created_at;
    }
  }

  return {
    totalAmount,
    count: invoices.length,
    byStatus,
    issuedCount,
    sentCount,
    pendingCount,
    failedCount,
    lastDocumentAt,
  };
}

export async function listCompanyInvoices(
  companyId: string,
  filters: InvoiceListFilters = {},
): Promise<BillingInvoice[]> {
  let query = getSupabase()
    .from("billing_invoices")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.documentType) {
    query = query.eq("document_type", filters.documentType);
  }
  if (filters.fromDate) {
    query = query.gte("created_at", filters.fromDate);
  }
  if (filters.toDate) {
    query = query.lte("created_at", filters.toDate);
  }
  if (filters.search) {
    const q = filters.search.trim();
    if (q) {
      if (isUuid(q)) {
        query = query.eq("order_id", q);
      } else {
        query = query.ilike("invoice_number", `%${q}%`);
      }
    }
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[billing] listCompanyInvoices failed", error);
    return [];
  }
  return (data ?? []) as BillingInvoice[];
}

export function summarizeAdminInvoices(
  invoices: BillingInvoice[],
  orderById: Map<string, SmsOrderRow>,
): AdminInvoiceSummary {
  const base = summarizeCompanyInvoices(invoices);
  let monthAmount = 0;
  let mercadoPagoAmount = 0;
  let manualAmount = 0;

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  for (const inv of invoices) {
    const amt = toNumber(inv.total_amount);
    const at = new Date(inv.issued_at ?? inv.created_at);
    if (at >= monthStart) {
      monthAmount += amt;
    }

    const order = orderById.get(inv.order_id);
    const provider =
      order?.payment_provider ??
      (typeof inv.metadata?.order_payment_provider === "string"
        ? inv.metadata.order_payment_provider
        : null);

    if (provider === "mercadopago") {
      mercadoPagoAmount += amt;
    } else if (
      provider === "manual" ||
      provider === "pending_checkout"
    ) {
      manualAmount += amt;
    }
  }

  return {
    ...base,
    monthAmount,
    mercadoPagoAmount,
    manualAmount,
  };
}

export async function getAdminInvoiceById(
  invoiceId: string,
): Promise<AdminInvoiceDetail | null> {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return null;
  }

  const [company, order] = await Promise.all([
    findCompanyById(invoice.company_id),
    getOrderById(invoice.order_id),
  ]);

  return {
    ...invoice,
    company,
    order,
  };
}

export async function listAdminInvoices(
  filters: AdminInvoiceListFilters = {},
): Promise<AdminInvoiceListRow[]> {
  let query = getSupabase()
    .from("billing_invoices")
    .select("*, companies ( id, name, rut, billing_email )")
    .order("created_at", { ascending: false });

  if (filters.companyId) {
    query = query.eq("company_id", filters.companyId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.documentType) {
    query = query.eq("document_type", filters.documentType);
  }
  if (filters.fromDate) {
    query = query.gte("created_at", filters.fromDate);
  }
  if (filters.toDate) {
    query = query.lte("created_at", filters.toDate);
  }
  if (filters.search) {
    const q = filters.search.trim();
    if (q) {
      if (isUuid(q)) {
        query = query.eq("order_id", q);
      } else {
        query = query.or(
          `invoice_number.ilike.%${q}%,provider_document_id.ilike.%${q}%`,
        );
      }
    }
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[billing] listAdminInvoices failed", error);
    return [];
  }
  return (data ?? []) as AdminInvoiceListRow[];
}

async function createInvoiceRowFromOrder(
  order: SmsOrderRow,
  options?: { initialStatus?: BillingInvoiceStatus },
): Promise<BillingInvoice | null> {
  const company = await findCompanyById(order.company_id);
  const nowIso = new Date().toISOString();

  const total = toNumber(order.amount);
  const currency = order.currency || "CLP";

  const baseInsert = {
    company_id: order.company_id,
    order_id: order.id,
    invoice_number: buildReceiptNumber(order.id, 0),
    document_type: "purchase_receipt" as const,
    tax_document_type: null,
    status: (options?.initialStatus ?? "issued") as BillingInvoiceStatus,
    payment_status: order.payment_status ?? "pending",
    currency,
    subtotal_amount: total,
    tax_amount: 0,
    total_amount: total,
    tax_rate: 0,
    customer_name: company?.name ?? null,
    customer_legal_name: company?.legal_name ?? null,
    customer_tax_id: company?.rut ?? null,
    customer_email: company?.billing_email ?? null,
    customer_phone: company?.contact_phone ?? null,
    customer_address: (company?.metadata as any)?.address ?? null,
    customer_city: (company?.metadata as any)?.city ?? null,
    customer_commune: (company?.metadata as any)?.commune ?? null,
    customer_business_activity: (company?.metadata as any)?.business_activity ?? null,
    customer_country: company?.country ?? "CL",
    issued_at: nowIso,
    due_at: null,
    paid_at: order.payment_status === "paid" ? nowIso : null,
    cancelled_at: null,
    pdf_url: null,
    html_url: null,
    provider: null,
    provider_document_id: null,
    provider_status: null,
    provider_payload: {},
    metadata: {
      note: "Documento interno no tributario (Etapa 12.x).",
      source: "ensureInvoiceForOrder",
      order_payment_provider: order.payment_provider,
      order_payment_reference: order.payment_reference,
    },
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const invoice_number = buildReceiptNumber(order.id, attempt);
    const { data, error } = await getSupabase()
      .from("billing_invoices")
      .insert({
        ...baseInsert,
        invoice_number,
      })
      .select("*")
      .single();

    if (!error) {
      return data as BillingInvoice;
    }

    // Si chocamos por uniqueness (order_id o invoice_number), resolvemos idempotencia.
    if (isDuplicateKeyError(error) || String(error.message ?? "").includes("idx_billing_invoices_order_unique")) {
      const existing = await getInvoiceByOrderId(order.id);
      if (existing) {
        return existing;
      }
    }

    if (!String(error.message ?? "").includes("invoice_number")) {
      console.warn("[billing] createInvoiceRowFromOrder failed", error);
      return null;
    }
  }

  const fallback = await getInvoiceByOrderId(order.id);
  return fallback;
}

export async function ensureInvoiceForOrder(
  orderId: string,
  input: CreateInvoiceForOrderInput = { orderId },
): Promise<BillingInvoice | null> {
  // Firma compatible: allow call ensureInvoiceForOrder(orderId)
  const requireCredited = input.requireCredited ?? true;
  const initialStatus = input.initialStatus;

  const order = await getOrderById(orderId);
  if (!order) {
    return null;
  }

  if (order.payment_status !== "paid") {
    return null;
  }
  if (requireCredited && order.credit_status !== "credited") {
    return null;
  }

  const existing = await getInvoiceByOrderId(order.id);
  if (existing) {
    return existing;
  }

  const created = await createInvoiceRowFromOrder(order, { initialStatus });
  if (!created) {
    return null;
  }

  await recordBillingEvent({
    invoiceId: created.id,
    companyId: created.company_id,
    eventType: "invoice.created",
    description: "Comprobante interno creado desde orden pagada.",
    actorType: "system",
    actorId: null,
    metadata: { order_id: created.order_id, document_type: created.document_type },
  });

  const items = await createItemsForInvoiceFromOrder(created.id, order);
  if (items.length > 0) {
    await recordBillingEvent({
      invoiceId: created.id,
      companyId: created.company_id,
      eventType: "invoice.item_created",
      description: "Ítems creados desde la bolsa SMS comprada.",
      actorType: "system",
      actorId: null,
      metadata: { count: items.length },
    });
  }

  return created;
}

export async function createInvoiceForPaidOrder(
  orderId: string,
): Promise<BillingInvoice | null> {
  return ensureInvoiceForOrder(orderId, { orderId, requireCredited: true });
}

/** Tras envío mock/real exitoso: issued → sent (no toca paid/cancelled/failed/voided). */
export async function syncInvoiceStatusAfterEmailSent(
  invoiceId: string,
  currentStatus: BillingInvoiceStatus,
): Promise<void> {
  if (currentStatus !== "issued" && currentStatus !== "pending_issue") {
    return;
  }
  const { error } = await getSupabase()
    .from("billing_invoices")
    .update({ status: "sent" })
    .eq("id", invoiceId);
  if (error) {
    console.warn("[billing] syncInvoiceStatusAfterEmailSent failed", error);
  }
}

