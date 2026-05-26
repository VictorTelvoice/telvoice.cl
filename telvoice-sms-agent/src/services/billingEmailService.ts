import { env, isBillingEmailMock } from "../config/env.js";
import type { BillingEmailLog, BillingEmailStatus } from "../types/billing.js";
import type { AdminInvoiceDetail } from "../types/billing.js";
import { escapeHtml, formatDate } from "../utils/html.js";
import { formatOrderShortId, paymentMethodLabel } from "../utils/order-display.js";
import { getSupabase } from "../database/supabaseClient.js";
import {
  getAdminInvoiceById,
  syncInvoiceStatusAfterEmailSent,
} from "./billingInvoiceService.js";
import { recordBillingEvent } from "./billingEventService.js";

export type BillingEmailMode = typeof env.billingEmail.mode;

export type SendInvoiceEmailResult = {
  success: boolean;
  mode: BillingEmailMode;
  emailLogId?: string;
  message: string;
  toEmail?: string;
};

export type SendInvoiceEmailOptions = {
  actorType?: string;
  actorId?: string | null;
  source?: string;
  isResend?: boolean;
};

function shortDocId(id: string): string {
  return id.replaceAll("-", "").slice(0, 8).toUpperCase();
}

function documentNumber(invoice: {
  id: string;
  invoice_number: string | null;
}): string {
  return invoice.invoice_number?.trim() || `DOC-${shortDocId(invoice.id)}`;
}

function fmtMoney(amount: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function resolveRecipientEmail(detail: AdminInvoiceDetail): string | null {
  const candidates = [
    detail.customer_email,
    detail.company?.billing_email,
  ];
  for (const c of candidates) {
    const t = c?.trim();
    if (t && t.includes("@")) {
      return t;
    }
  }
  return null;
}

function primaryItemDescription(detail: AdminInvoiceDetail): string {
  const first = detail.items?.[0]?.description;
  return first?.trim() || "Bolsa SMS";
}

export function getBillingEmailMode(): BillingEmailMode {
  return env.billingEmail.mode;
}

export function buildInvoiceEmailSubject(detail: AdminInvoiceDetail): string {
  const num = documentNumber(detail);
  return `Comprobante de compra Telvoice — ${num}`;
}

export function buildInvoiceEmailHtml(detail: AdminInvoiceDetail): string {
  const num = documentNumber(detail);
  const customerName = escapeHtml(
    detail.customer_name ?? detail.company?.name ?? "Cliente",
  );
  const previewUrl = `${env.publicAppUrl}/app/invoices/${detail.id}/preview`;
  const panelUrl = `${env.publicAppUrl}/app/invoices/${detail.id}`;
  const order = detail.order;
  const bag = escapeHtml(primaryItemDescription(detail));
  const total = fmtMoney(Number(detail.total_amount), detail.currency);
  const issued = escapeHtml(formatDate(detail.issued_at ?? detail.created_at));
  const orderRef = order
    ? escapeHtml(order.payment_reference ?? formatOrderShortId(order.id))
    : "—";
  const payment = order
    ? escapeHtml(paymentMethodLabel(order.payment_provider))
    : "—";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,system-ui,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <tr><td style="background:#0052cc;color:#fff;padding:24px 28px">
          <div style="font-size:22px;font-weight:800">Telvoice</div>
          <div style="font-size:14px;opacity:0.9;margin-top:4px">Comprobante de compra</div>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 16px;font-size:15px">Hola <strong>${customerName}</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#334155">
            Te enviamos el respaldo de tu compra de SMS en Telvoice. Este es un <strong>comprobante interno de compra</strong> (documento no tributario).
          </p>
          <table role="presentation" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:20px">
            <tr><td style="padding:16px;font-size:13px;line-height:1.6">
              <div><strong>Documento:</strong> ${escapeHtml(num)}</div>
              <div><strong>Orden:</strong> ${orderRef}</div>
              <div><strong>Bolsa:</strong> ${bag}</div>
              <div><strong>Monto:</strong> ${total}</div>
              <div><strong>Fecha:</strong> ${issued}</div>
              <div><strong>Pago:</strong> ${payment}</div>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;text-align:center">
            <a href="${escapeHtml(previewUrl)}" style="display:inline-block;background:#0052cc;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">Ver comprobante en el panel</a>
          </p>
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5">
            También puedes consultar tus documentos en <a href="${escapeHtml(panelUrl)}" style="color:#0052cc">Facturación</a> del panel cliente.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5">
            Este documento corresponde a un comprobante interno no tributario. No es una factura electrónica ni reemplaza documentación fiscal ante el SII.
            <br />Telvoice · <a href="https://www.telvoice.cl" style="color:#0052cc">www.telvoice.cl</a> · soporte@telvoice.cl
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildInvoiceEmailText(detail: AdminInvoiceDetail): string {
  const num = documentNumber(detail);
  const name = detail.customer_name ?? detail.company?.name ?? "Cliente";
  const previewUrl = `${env.publicAppUrl}/app/invoices/${detail.id}/preview`;
  const bag = primaryItemDescription(detail);
  const total = fmtMoney(Number(detail.total_amount), detail.currency);
  const issued = formatDate(detail.issued_at ?? detail.created_at);
  const orderRef =
    detail.order?.payment_reference ??
    (detail.order ? formatOrderShortId(detail.order.id) : "—");

  return `Hola ${name},

Te enviamos el respaldo de tu compra de SMS en Telvoice.

Documento: ${num}
Orden: ${orderRef}
Bolsa: ${bag}
Monto: ${total}
Fecha: ${issued}

Ver comprobante: ${previewUrl}

Este documento es un comprobante interno de compra (no tributario). No es factura electrónica ni documento ante el SII.

Telvoice — www.telvoice.cl — soporte@telvoice.cl`;
}

export async function getLatestEmailStatus(
  invoiceId: string,
): Promise<BillingEmailLog | null> {
  const { data, error } = await getSupabase()
    .from("billing_email_logs")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[billing-email] getLatestEmailStatus failed", error);
    return null;
  }
  return (data as BillingEmailLog | null) ?? null;
}

async function insertEmailLog(input: {
  invoiceId: string;
  companyId: string;
  toEmail: string;
  subject: string;
  status: BillingEmailStatus;
  provider: string;
  errorMessage?: string | null;
  sentAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<BillingEmailLog | null> {
  const { data, error } = await getSupabase()
    .from("billing_email_logs")
    .insert({
      invoice_id: input.invoiceId,
      company_id: input.companyId,
      to_email: input.toEmail,
      subject: input.subject,
      status: input.status,
      provider: input.provider,
      error_message: input.errorMessage ?? null,
      sent_at: input.sentAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    console.warn("[billing-email] insertEmailLog failed", error);
    return null;
  }
  return data as BillingEmailLog;
}

async function deliverMockEmail(
  detail: AdminInvoiceDetail,
  options: SendInvoiceEmailOptions,
): Promise<SendInvoiceEmailResult> {
  const toEmail = resolveRecipientEmail(detail);
  const subject = buildInvoiceEmailSubject(detail);
  const source = options.source ?? "admin_invoice_send_email";
  const isResend = options.isResend === true;

  await recordBillingEvent({
    invoiceId: detail.id,
    companyId: detail.company_id,
    eventType: "invoice.email_pending",
    description: isResend
      ? "Reenvío de comprobante (mock) en cola."
      : "Envío de comprobante (mock) en cola.",
    actorType: options.actorType ?? "superadmin",
    actorId: options.actorId ?? null,
    metadata: {
      mode: getBillingEmailMode(),
      source,
      to_email: toEmail ?? null,
      is_resend: isResend,
    },
  });

  if (!toEmail) {
    const log = await insertEmailLog({
      invoiceId: detail.id,
      companyId: detail.company_id,
      toEmail: "—",
      subject,
      status: "failed",
      provider: "mock",
      errorMessage: "No hay email de facturación disponible.",
      metadata: {
        mock: true,
        mode: "mock",
        source,
        is_resend: isResend,
      },
    });

    await recordBillingEvent({
      invoiceId: detail.id,
      companyId: detail.company_id,
      eventType: "invoice.email_failed",
      description: "No hay email de facturación disponible.",
      actorType: options.actorType ?? "superadmin",
      actorId: options.actorId ?? null,
      metadata: { mode: "mock", source, email_log_id: log?.id },
    });

    return {
      success: false,
      mode: getBillingEmailMode(),
      emailLogId: log?.id,
      message: "No hay email de facturación disponible para este cliente.",
    };
  }

  const html = buildInvoiceEmailHtml(detail);
  const text = buildInvoiceEmailText(detail);
  const now = new Date().toISOString();

  const log = await insertEmailLog({
    invoiceId: detail.id,
    companyId: detail.company_id,
    toEmail,
    subject,
    status: "sent",
    provider: "mock",
    sentAt: now,
    metadata: {
      mock: true,
      mode: "mock",
      source,
      is_resend: isResend,
      invoice_number: documentNumber(detail),
      order_id: detail.order_id,
      body_html_length: html.length,
      body_text_length: text.length,
      from: env.billingEmail.from,
      reply_to: env.billingEmail.replyTo,
    },
  });

  await syncInvoiceStatusAfterEmailSent(detail.id, detail.status);

  await recordBillingEvent({
    invoiceId: detail.id,
    companyId: detail.company_id,
    eventType: "invoice.email_sent",
    description: isResend
      ? "Comprobante reenviado (simulado en modo mock)."
      : "Comprobante enviado (simulado en modo mock).",
    actorType: options.actorType ?? "superadmin",
    actorId: options.actorId ?? null,
    metadata: {
      mode: "mock",
      provider: "mock",
      to_email: toEmail,
      source,
      email_log_id: log?.id,
      is_resend: isResend,
    },
  });

  console.info(
    "[billing-email:mock]",
    isResend ? "resend" : "send",
    detail.id,
    "→",
    toEmail,
    subject,
  );

  return {
    success: true,
    mode: getBillingEmailMode(),
    emailLogId: log?.id,
    toEmail,
    message: isResend
      ? "Reenvío simulado registrado correctamente (modo mock, sin correo real)."
      : "Email simulado registrado correctamente (modo mock, sin correo real).",
  };
}

export async function sendInvoiceEmail(
  invoiceId: string,
  options: SendInvoiceEmailOptions = {},
): Promise<SendInvoiceEmailResult> {
  const detail = await getAdminInvoiceById(invoiceId);
  if (!detail) {
    return {
      success: false,
      mode: getBillingEmailMode(),
      message: "Comprobante no encontrado.",
    };
  }

  if (isBillingEmailMock()) {
    return deliverMockEmail(detail, options);
  }

  return {
    success: false,
    mode: getBillingEmailMode(),
    message: `Proveedor de email "${getBillingEmailMode()}" aún no está implementado. Use BILLING_EMAIL_MODE=mock.`,
  };
}

export async function resendInvoiceEmail(
  invoiceId: string,
  options: SendInvoiceEmailOptions = {},
): Promise<SendInvoiceEmailResult> {
  return sendInvoiceEmail(invoiceId, {
    ...options,
    isResend: true,
    source: options.source ?? "admin_invoice_resend_email",
  });
}

export { isBillingEmailMock };
