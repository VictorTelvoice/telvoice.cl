import type {
  BillingRecoveryActor,
  BillingRecoverySummary,
  FailedBillingEmailRow,
  FailedBillingSyncRow,
  InvoiceRecoveryHints,
  InvoiceWithoutEmailRow,
  OrderWithoutInvoiceRow,
} from "../types/billing.js";
import { getSupabase } from "../database/supabaseClient.js";
import { recordBillingEvent } from "./billingEventService.js";
import {
  hasSuccessfulBillingEmail,
  resendInvoiceEmail,
  sendInvoiceEmailIfNeeded,
  type SendInvoiceEmailIfNeededResult,
} from "./billingEmailService.js";
import { getAdminInvoiceById, getInvoiceByOrderId } from "./billingInvoiceService.js";
import {
  ensureBillingForCreditedOrder,
  type BillingSyncResult,
} from "./billingSyncService.js";
import { getOrderById } from "./smsOrderService.js";

export type BillingRecoveryFilters = {
  limit?: number;
  companyId?: string;
};

const DEFAULT_LIMIT = 100;

function isReviewed(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  return Boolean(metadata.reviewed_at);
}

export async function getBillingRecoverySummary(
  filters: BillingRecoveryFilters = {},
): Promise<BillingRecoverySummary> {
  const limit = filters.limit ?? 500;

  const [
    ordersWithout,
    invoicesWithout,
    failedEmails,
    failedSyncs,
    pendingDocs,
    lastRecovery,
  ] = await Promise.all([
    findPaidCreditedOrdersWithoutInvoice({ ...filters, limit }),
    findInvoicesWithoutSuccessfulEmail({ ...filters, limit }),
    findFailedBillingEmails({ ...filters, limit, includeReviewed: true }),
    findFailedBillingSyncEvents({ limit: 50 }),
    countPendingDocuments(filters),
    getLastRecoveryTimestamp(),
  ]);

  const failedUnreviewed = failedEmails.filter((e) => !e.reviewed).length;

  const hasIssues =
    ordersWithout.length > 0 ||
    invoicesWithout.length > 0 ||
    failedUnreviewed > 0 ||
    failedSyncs.length > 0;

  return {
    ordersWithoutInvoice: ordersWithout.length,
    invoicesWithoutEmail: invoicesWithout.length,
    failedEmails: failedEmails.length,
    failedEmailsUnreviewed: failedUnreviewed,
    failedSyncs: failedSyncs.length,
    pendingDocuments: pendingDocs,
    lastRecoveryAt: lastRecovery,
    hasIssues,
  };
}

async function getLastRecoveryTimestamp(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("billing_events")
    .select("created_at")
    .eq("event_type", "billing.recovery.completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data.created_at as string;
}

async function countPendingDocuments(
  filters: BillingRecoveryFilters,
): Promise<number> {
  let q = getSupabase()
    .from("billing_invoices")
    .select("id", { count: "exact", head: true })
    .in("status", ["draft", "pending_issue", "issued"]);

  if (filters.companyId) {
    q = q.eq("company_id", filters.companyId);
  }

  const { count, error } = await q;
  if (error) {
    console.warn("[billing-recovery] countPendingDocuments failed", error);
    return 0;
  }
  return count ?? 0;
}

export async function findPaidCreditedOrdersWithoutInvoice(
  filters: BillingRecoveryFilters = {},
): Promise<OrderWithoutInvoiceRow[]> {
  const limit = filters.limit ?? DEFAULT_LIMIT;

  let orderQuery = getSupabase()
    .from("sms_orders")
    .select(
      "id, company_id, payment_provider, amount, currency, payment_status, credit_status, created_at, credited_at, companies(name)",
    )
    .eq("payment_status", "paid")
    .eq("credit_status", "credited")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.companyId) {
    orderQuery = orderQuery.eq("company_id", filters.companyId);
  }

  const { data: orders, error } = await orderQuery;
  if (error) {
    console.warn("[billing-recovery] findPaidCreditedOrdersWithoutInvoice", error);
    return [];
  }
  if (!orders?.length) {
    return [];
  }

  const orderIds = orders.map((o) => o.id as string);
  const { data: invoices } = await getSupabase()
    .from("billing_invoices")
    .select("order_id")
    .in("order_id", orderIds);

  const withInvoice = new Set((invoices ?? []).map((i) => i.order_id as string));

  return orders
    .filter((o) => !withInvoice.has(o.id as string))
    .map((o) => {
      const company = o.companies as { name?: string } | null;
      return {
        order_id: o.id as string,
        company_id: o.company_id as string,
        company_name: company?.name ?? "—",
        payment_provider: o.payment_provider as string | null,
        amount: Number(o.amount),
        currency: o.currency as string,
        payment_status: o.payment_status as string,
        credit_status: o.credit_status as string,
        created_at: o.created_at as string,
        credited_at: (o.credited_at as string | null) ?? null,
      };
    });
}

export async function findInvoicesWithoutSuccessfulEmail(
  filters: BillingRecoveryFilters = {},
): Promise<InvoiceWithoutEmailRow[]> {
  const limit = filters.limit ?? DEFAULT_LIMIT;

  let invQuery = getSupabase()
    .from("billing_invoices")
    .select(
      "id, invoice_number, company_id, order_id, status, customer_email, total_amount, currency, companies(name, billing_email)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.companyId) {
    invQuery = invQuery.eq("company_id", filters.companyId);
  }

  const { data: invoices, error } = await invQuery;
  if (error || !invoices?.length) {
    return [];
  }

  const invoiceIds = invoices.map((i) => i.id as string);
  const { data: sentLogs } = await getSupabase()
    .from("billing_email_logs")
    .select("invoice_id")
    .in("invoice_id", invoiceIds)
    .eq("status", "sent");

  const sentSet = new Set((sentLogs ?? []).map((l) => l.invoice_id as string));

  return invoices
    .filter((inv) => !sentSet.has(inv.id as string))
    .map((inv) => {
      const company = inv.companies as {
        name?: string;
        billing_email?: string | null;
      } | null;
      return {
        invoice_id: inv.id as string,
        invoice_number: inv.invoice_number as string | null,
        company_id: inv.company_id as string,
        company_name: company?.name ?? "—",
        order_id: inv.order_id as string,
        status: inv.status as string,
        billing_email: company?.billing_email ?? null,
        customer_email: inv.customer_email as string | null,
        total_amount: Number(inv.total_amount),
        currency: inv.currency as string,
      };
    });
}

export async function findFailedBillingEmails(
  filters: BillingRecoveryFilters & { includeReviewed?: boolean } = {},
): Promise<FailedBillingEmailRow[]> {
  const limit = filters.limit ?? DEFAULT_LIMIT;

  let q = getSupabase()
    .from("billing_email_logs")
    .select(
      "id, invoice_id, to_email, error_message, created_at, metadata, billing_invoices(invoice_number, company_id, companies(name))",
    )
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await q;
  if (error || !data) {
    return [];
  }

  return data
    .map((row) => {
      const inv = row.billing_invoices as {
        invoice_number?: string | null;
        company_id?: string | null;
        companies?: { name?: string } | null;
      } | null;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const reviewed = isReviewed(meta);
      return {
        email_log_id: row.id as string,
        invoice_id: row.invoice_id as string,
        invoice_number: inv?.invoice_number ?? null,
        company_id: inv?.company_id ?? null,
        company_name: inv?.companies?.name ?? "—",
        to_email: row.to_email as string,
        error_message: row.error_message as string | null,
        created_at: row.created_at as string,
        reviewed,
      };
    })
    .filter((row) => filters.includeReviewed || !row.reviewed);
}

export async function findFailedBillingSyncEvents(
  filters: { limit?: number } = {},
): Promise<FailedBillingSyncRow[]> {
  const limit = filters.limit ?? 50;

  const { data, error } = await getSupabase()
    .from("billing_events")
    .select(
      "id, invoice_id, description, created_at, metadata, billing_invoices(invoice_number, order_id, companies(name))",
    )
    .eq("event_type", "billing.sync.failed")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((e) => {
    const inv = e.billing_invoices as {
      invoice_number?: string | null;
      order_id?: string | null;
      companies?: { name?: string } | null;
    } | null;
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const err =
      (typeof meta.error === "string" ? meta.error : null) ??
      e.description ??
      null;
    return {
      event_id: e.id as string,
      invoice_id: e.invoice_id as string,
      invoice_number: inv?.invoice_number ?? null,
      order_id: inv?.order_id ?? null,
      company_name: inv?.companies?.name ?? "—",
      error_message: err,
      created_at: e.created_at as string,
    };
  });
}

export async function getInvoiceRecoveryHints(
  invoiceId: string,
): Promise<InvoiceRecoveryHints> {
  const { data: failedLogs } = await getSupabase()
    .from("billing_email_logs")
    .select("id, status, metadata")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });

  const logs = failedLogs ?? [];
  const latestFailed = logs.find((l) => l.status === "failed");
  const hasSuccessful = await hasSuccessfulBillingEmail(invoiceId);

  const { data: syncFailed } = await getSupabase()
    .from("billing_events")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("event_type", "billing.sync.failed")
    .limit(1);

  return {
    hasFailedEmail: Boolean(latestFailed),
    hasSuccessfulEmail: hasSuccessful,
    hasSyncFailed: (syncFailed?.length ?? 0) > 0,
    latestFailedEmailLogId: (latestFailed?.id as string) ?? null,
  };
}

async function recordRecoveryOnInvoice(
  invoiceId: string,
  companyId: string,
  eventType:
    | "billing.recovery.started"
    | "billing.recovery.completed"
    | "billing.recovery.failed",
  description: string,
  metadata: Record<string, unknown>,
  actor: BillingRecoveryActor,
): Promise<void> {
  await recordBillingEvent({
    invoiceId,
    companyId,
    eventType,
    description,
    actorType: actor.actorType,
    actorId: actor.actorId,
    metadata,
  });
}

export async function retryBillingSyncForOrder(
  orderId: string,
  actor: BillingRecoveryActor,
): Promise<{ ok: boolean; message: string; sync?: BillingSyncResult }> {
  const order = await getOrderById(orderId);
  if (!order) {
    return { ok: false, message: "Orden no encontrada." };
  }
  if (order.payment_status !== "paid" || order.credit_status !== "credited") {
    return {
      ok: false,
      message: "La orden debe estar pagada y acreditada.",
    };
  }

  const existing = await getInvoiceByOrderId(orderId);
  if (existing) {
    await recordRecoveryOnInvoice(
      existing.id,
      existing.company_id,
      "billing.recovery.started",
      "Reintento manual de sincronización Billing (comprobante ya existía).",
      { order_id: orderId, invoice_existed: true },
      actor,
    );
  }

  const sync = await ensureBillingForCreditedOrder(orderId, {
    source: "admin_recovery_sync",
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  const invoiceId = sync.invoiceId ?? existing?.id;
  if (!invoiceId) {
    return {
      ok: false,
      message: sync.error ?? "No se pudo sincronizar Billing.",
      sync,
    };
  }

  const invoice = await getInvoiceByOrderId(orderId);
  const companyId = invoice?.company_id ?? order.company_id;

  if (sync.ok) {
    await recordRecoveryOnInvoice(
      invoiceId,
      companyId,
      "billing.recovery.completed",
      existing && !sync.invoiceCreated
        ? "Recuperación: comprobante ya existía; sync completado."
        : "Recuperación: comprobante y email mock procesados.",
      {
        order_id: orderId,
        invoice_created: sync.invoiceCreated ?? false,
        email_sent: sync.emailSent ?? false,
        email_skipped: sync.emailSkipped ?? false,
      },
      actor,
    );
    const parts: string[] = [];
    if (existing && !sync.invoiceCreated) {
      parts.push("comprobante ya existía");
    } else if (sync.invoiceCreated) {
      parts.push("comprobante creado");
    }
    if (sync.emailSent) {
      parts.push("email mock registrado");
    } else if (sync.emailSkipped) {
      parts.push("email omitido (ya enviado)");
    }
    return {
      ok: true,
      message: `Sync OK: ${parts.join(" · ") || "sin cambios"}.`,
      sync,
    };
  }

  await recordRecoveryOnInvoice(
    invoiceId,
    companyId,
    "billing.recovery.failed",
    "Recuperación Billing falló.",
    { order_id: orderId, error: sync.error },
    actor,
  );
  return {
    ok: false,
    message: sync.error ?? "Sync falló.",
    sync,
  };
}

export async function retryInvoiceEmail(
  invoiceId: string,
  actor: BillingRecoveryActor,
  options: { forceResend?: boolean } = {},
): Promise<{ ok: boolean; message: string }> {
  const detail = await getAdminInvoiceById(invoiceId);
  if (!detail) {
    return { ok: false, message: "Comprobante no encontrado." };
  }

  await recordBillingEvent({
    invoiceId: detail.id,
    companyId: detail.company_id,
    eventType: "invoice.email_retry_started",
    description: options.forceResend
      ? "Reintento manual de email (mock)."
      : "Envío manual de email mock desde recuperación.",
    actorType: actor.actorType,
    actorId: actor.actorId,
    metadata: { source: "admin_recovery_send_email", force_resend: options.forceResend },
  });

  const hasSent = await hasSuccessfulBillingEmail(invoiceId);
  const result: SendInvoiceEmailIfNeededResult =
    options.forceResend || hasSent
      ? await resendInvoiceEmail(invoiceId, {
          actorType: actor.actorType,
          actorId: actor.actorId,
          source: "admin_recovery_resend_email",
        })
      : await sendInvoiceEmailIfNeeded(invoiceId, {
          actorType: actor.actorType,
          actorId: actor.actorId,
          source: "admin_recovery_send_email",
          skipIfAlreadySent: false,
        });

  const skipped = result.skipped === true;

  if (result.success) {
    await recordBillingEvent({
      invoiceId: detail.id,
      companyId: detail.company_id,
      eventType: "invoice.email_retry_completed",
      description: skipped
        ? "Email ya estaba enviado (omitido)."
        : "Email mock registrado en recuperación.",
      actorType: actor.actorType,
      actorId: actor.actorId,
      metadata: {
        email_log_id: result.emailLogId,
        skipped,
      },
    });
    return {
      ok: true,
      message: skipped
        ? "El email ya estaba registrado como enviado."
        : result.message,
    };
  }

  await recordBillingEvent({
    invoiceId: detail.id,
    companyId: detail.company_id,
    eventType: "invoice.email_retry_failed",
    description: result.message,
    actorType: actor.actorType,
    actorId: actor.actorId,
    metadata: {},
  });
  return { ok: false, message: result.message };
}

export async function retryFailedEmailLog(
  emailLogId: string,
  actor: BillingRecoveryActor,
): Promise<{ ok: boolean; message: string }> {
  const { data: log, error } = await getSupabase()
    .from("billing_email_logs")
    .select("id, invoice_id, status, metadata")
    .eq("id", emailLogId)
    .maybeSingle();

  if (error || !log) {
    return { ok: false, message: "Registro de email no encontrado." };
  }

  await getSupabase()
    .from("billing_email_logs")
    .update({
      status: "retrying",
      metadata: {
        ...((log.metadata as Record<string, unknown>) ?? {}),
        retry_started_at: new Date().toISOString(),
      },
    })
    .eq("id", emailLogId);

  return retryInvoiceEmail(log.invoice_id as string, actor, {
    forceResend: true,
  });
}

export async function markEmailLogReviewed(
  emailLogId: string,
  actor: BillingRecoveryActor,
): Promise<{ ok: boolean; message: string }> {
  const { data: log, error } = await getSupabase()
    .from("billing_email_logs")
    .select("id, invoice_id, company_id, metadata")
    .eq("id", emailLogId)
    .maybeSingle();

  if (error || !log) {
    return { ok: false, message: "Registro no encontrado." };
  }

  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  const { error: updErr } = await getSupabase()
    .from("billing_email_logs")
    .update({
      metadata: {
        ...meta,
        reviewed_at: now,
        reviewed_by: actor.actorId,
        reviewed_by_type: actor.actorType,
      },
    })
    .eq("id", emailLogId);

  if (updErr) {
    return { ok: false, message: "No se pudo marcar como revisado." };
  }

  await recordBillingEvent({
    invoiceId: log.invoice_id as string,
    companyId: (log.company_id as string | null) ?? null,
    eventType: "invoice.marked_reviewed",
    description: "Email fallido marcado como revisado por operaciones.",
    actorType: actor.actorType,
    actorId: actor.actorId,
    metadata: { email_log_id: emailLogId },
  });

  return { ok: true, message: "Marcado como revisado." };
}
