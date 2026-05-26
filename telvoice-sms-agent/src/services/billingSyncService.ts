import type {
  BillingInvoice,
  BillingOrderBillingState,
  BillingOrderSummary,
} from "../types/billing.js";
import { getInvoiceDocumentPreview } from "./billingDocumentService.js";
import { recordBillingEvent } from "./billingEventService.js";
import {
  getLatestEmailStatus,
  sendInvoiceEmailIfNeeded,
} from "./billingEmailService.js";
import {
  ensureInvoiceForOrder,
  getInvoiceByOrderId,
} from "./billingInvoiceService.js";
import { getOrderById } from "./smsOrderService.js";

export type BillingSyncSource =
  | "mercadopago_webhook"
  | "admin_manual_credit"
  | "admin_manual_sync"
  | string;

export type BillingSyncOptions = {
  source?: BillingSyncSource;
  actorType?: string;
  actorId?: string | null;
};

export type BillingSyncResult = {
  ok: boolean;
  orderId: string;
  source: string;
  invoiceId?: string;
  invoiceCreated?: boolean;
  documentGenerated?: boolean;
  emailSent?: boolean;
  emailSkipped?: boolean;
  emailFailed?: boolean;
  error?: string;
};

async function recordSyncEvent(
  invoice: BillingInvoice,
  eventType: "billing.sync.started" | "billing.sync.completed" | "billing.sync.failed",
  description: string,
  metadata: Record<string, unknown>,
  options: BillingSyncOptions,
): Promise<void> {
  await recordBillingEvent({
    invoiceId: invoice.id,
    companyId: invoice.company_id,
    eventType,
    description,
    actorType: options.actorType ?? "system",
    actorId: options.actorId ?? null,
    metadata: { source: options.source ?? "unknown", ...metadata },
  });
}

export async function getBillingOrderSummary(
  orderId: string,
): Promise<BillingOrderSummary> {
  const invoice = await getInvoiceByOrderId(orderId);
  if (!invoice) {
    return {
      invoiceId: null,
      invoiceNumber: null,
      invoiceStatus: null,
      billingState: "no_invoice",
      lastEmailError: null,
    };
  }

  const latestEmail = await getLatestEmailStatus(invoice.id);
  let billingState: BillingOrderBillingState = "invoice_ready";
  if (latestEmail?.status === "sent") {
    billingState = "email_sent";
  } else if (latestEmail?.status === "failed") {
    billingState = "email_failed";
  }

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    invoiceStatus: invoice.status,
    billingState,
    lastEmailError: latestEmail?.error_message ?? null,
  };
}

export async function ensureBillingForCreditedOrder(
  orderId: string,
  options: BillingSyncOptions = {},
): Promise<BillingSyncResult> {
  const source = options.source ?? "unknown";
  const base: BillingSyncResult = { ok: false, orderId, source };

  const order = await getOrderById(orderId);
  if (!order) {
    return { ...base, error: "order_not_found" };
  }
  if (order.payment_status !== "paid" || order.credit_status !== "credited") {
    return { ...base, error: "order_not_paid_or_credited" };
  }

  let invoice: BillingInvoice | null = null;

  try {
    const existingBefore = await getInvoiceByOrderId(orderId);
    invoice = await ensureInvoiceForOrder(orderId);
    if (!invoice) {
      return { ...base, error: "invoice_ensure_failed" };
    }

    const invoiceCreated = !existingBefore;

    await recordSyncEvent(
      invoice,
      "billing.sync.started",
      "Sincronización Billing iniciada.",
      { order_id: orderId, invoice_created: invoiceCreated },
      { ...options, source },
    );

    let documentGenerated = false;
    try {
      const preview = await getInvoiceDocumentPreview(invoice.id);
      documentGenerated = Boolean(preview);
    } catch (docErr) {
      console.warn(
        "[billing-sync] document preview failed",
        orderId,
        docErr instanceof Error ? docErr.message : docErr,
      );
    }

    const emailResult = await sendInvoiceEmailIfNeeded(invoice.id, {
      source,
      actorType: options.actorType ?? "system",
      actorId: options.actorId ?? null,
      skipIfAlreadySent: true,
    });

    const emailSkipped = emailResult.skipped === true;
    const emailSent = emailResult.success && !emailSkipped;
    const emailFailed = !emailResult.success && !emailSkipped;

    await recordSyncEvent(
      invoice,
      "billing.sync.completed",
      emailSkipped
        ? "Sincronización Billing completada (email ya enviado, omitido)."
        : emailSent
          ? "Sincronización Billing completada con email mock registrado."
          : "Sincronización Billing completada (email no enviado).",
      {
        order_id: orderId,
        invoice_created: invoiceCreated,
        document_generated: documentGenerated,
        email_sent: emailSent,
        email_skipped: emailSkipped,
        email_failed: emailFailed,
        email_log_id: emailResult.emailLogId ?? null,
      },
      { ...options, source },
    );

    return {
      ok: true,
      orderId,
      source,
      invoiceId: invoice.id,
      invoiceCreated,
      documentGenerated,
      emailSent,
      emailSkipped,
      emailFailed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (invoice) {
      await recordSyncEvent(
        invoice,
        "billing.sync.failed",
        "Sincronización Billing falló.",
        { order_id: orderId, error: message },
        { ...options, source },
      );
    }
    console.error("[billing-sync] ensureBillingForCreditedOrder exception", orderId, message);
    return { ...base, invoiceId: invoice?.id, error: message };
  }
}

/** Alias del flujo post-pago acreditado. */
export async function syncBillingForPaidCreditedOrder(
  orderId: string,
  options?: BillingSyncOptions,
): Promise<BillingSyncResult> {
  return ensureBillingForCreditedOrder(orderId, options);
}

/**
 * Best-effort: nunca lanza hacia el webhook ni la acreditación.
 */
export async function runBillingSyncBestEffort(
  orderId: string,
  options?: BillingSyncOptions,
): Promise<BillingSyncResult> {
  try {
    const result = await ensureBillingForCreditedOrder(orderId, options);
    if (!result.ok) {
      console.error(
        "[billing-sync] failed",
        orderId,
        result.error ?? "unknown",
        "source=",
        result.source,
      );
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[billing-sync] unexpected", orderId, message);
    return {
      ok: false,
      orderId,
      source: options?.source ?? "unknown",
      error: message,
    };
  }
}
