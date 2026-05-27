import { env, isBillingEmailMock } from "../config/env.js";
import type { BillingEmailLog, BillingEmailStatus } from "../types/billing.js";
import type { AdminInvoiceDetail } from "../types/billing.js";
import { escapeHtml } from "../utils/html.js";
import { formatOrderShortId } from "../utils/order-display.js";
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
  /** En automatización: omitir si ya hay email sent. Default true en sendInvoiceEmailIfNeeded. */
  skipIfAlreadySent?: boolean;
};

export type SendInvoiceEmailIfNeededResult = SendInvoiceEmailResult & {
  skipped?: boolean;
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

function fmtSms(n: number): string {
  return new Intl.NumberFormat("es-CL").format(n);
}

function absolutePublicUrl(pathname: string): string {
  const base = env.publicAppUrl.replace(/\/$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
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
  const previewUrl = `${env.publicAppUrl}/app/invoices/${detail.id}/preview`;
  const order = detail.order;
  const bag = escapeHtml(primaryItemDescription(detail));
  const total = fmtMoney(Number(detail.total_amount), detail.currency);
  const orderRef = order
    ? escapeHtml(order.payment_reference ?? formatOrderShortId(order.id))
    : "—";
  const sms = order ? fmtSms(Number(order.sms_quantity ?? 0)) : "—";
  const logoUrl = absolutePublicUrl("/assets/telvoice-isotipo.png");
  const replyTo = escapeHtml(env.transactionalEmail.replyTo);

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,system-ui,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <tr>
          <td align="center" bgcolor="#0052cc" style="background-color:#0052cc;padding:24px 28px 20px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td valign="middle" style="padding-right:10px">
                  <img
                    src="${escapeHtml(logoUrl)}"
                    width="40"
                    height="40"
                    alt="telvoice"
                    style="display:block;border:0;outline:none;text-decoration:none"
                  />
                </td>
                <td valign="middle" align="left">
                  <span style="font-family:Segoe UI,system-ui,sans-serif;font-size:28px;font-weight:700;line-height:1;color:#ffffff;text-transform:lowercase">telvoice</span>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.4;color:#ffffff;opacity:0.92;text-align:center">
              Comprobante de compra
            </p>
          </td>
        </tr>

        <tr><td align="center" style="padding:28px 28px 24px">
          <p style="margin:0 0 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;font-weight:700;line-height:1.55;color:#0f172a;text-align:center">
            Tu comprobante de compra Telvoice ya está disponible.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;margin:0 auto 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
            <tr>
              <td align="center" style="padding:16px 20px;font-family:Segoe UI,system-ui,sans-serif;font-size:13px;line-height:1.7;color:#334155;text-align:center">
                <div><strong>Número comprobante:</strong> ${escapeHtml(num)}</div>
                <div style="margin-top:6px"><strong>Orden:</strong> ${orderRef}</div>
                <div style="margin-top:6px"><strong>Bolsa:</strong> ${bag}</div>
                <div style="margin-top:6px"><strong>SMS:</strong> ${escapeHtml(sms)}</div>
                <div style="margin-top:6px"><strong>Monto:</strong> ${total}</div>
              </td>
            </tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
            <tr>
              <td align="center" bgcolor="#0052cc" style="background-color:#0052cc;border-radius:8px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(previewUrl)}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="12%" strokecolor="#0052cc" fillcolor="#0052cc">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;font-weight:bold;">Ver comprobante</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a
                  href="${escapeHtml(previewUrl)}"
                  target="_blank"
                  style="display:inline-block;padding:14px 32px;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;white-space:nowrap"
                >Ver comprobante</a>
                <!--<![endif]-->
              </td>
            </tr>
          </table>

          <p style="margin:18px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center;max-width:520px">
            Este documento corresponde a un comprobante interno de compra.
          </p>
        </td></tr>
      </table>
    </td></tr>

    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0;padding:16px 28px;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center">
        <tr>
          <td>
            Este correo fue enviado por Telvoice. Si no realizaste esta compra, contacta a
            <a href="mailto:${replyTo}" style="color:#0052cc;text-decoration:none">${replyTo}</a>.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildInvoiceEmailText(detail: AdminInvoiceDetail): string {
  const num = documentNumber(detail);
  const previewUrl = `${env.publicAppUrl}/app/invoices/${detail.id}/preview`;
  const bag = primaryItemDescription(detail);
  const total = fmtMoney(Number(detail.total_amount), detail.currency);
  const orderRef =
    detail.order?.payment_reference ??
    (detail.order ? formatOrderShortId(detail.order.id) : "—");
  const sms = detail.order ? fmtSms(Number(detail.order.sms_quantity ?? 0)) : "—";

  return `Tu comprobante de compra Telvoice ya está disponible.

Número comprobante: ${num}
Orden: ${orderRef}
Bolsa: ${bag}
SMS: ${sms}
Monto: ${total}

Ver comprobante: ${previewUrl}

Este documento corresponde a un comprobante interno de compra.`;
}

/** True si ya hay al menos un envío exitoso (mock o real) para la invoice. */
export async function hasSuccessfulBillingEmail(
  invoiceId: string,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("billing_email_logs")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("status", "sent")
    .limit(1);

  if (error) {
    console.warn("[billing-email] hasSuccessfulBillingEmail failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
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
  providerMessageId?: string | null;
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
      provider_message_id: input.providerMessageId ?? null,
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
      providerMessageId: null,
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
    providerMessageId: null,
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

export async function sendInvoiceEmailIfNeeded(
  invoiceId: string,
  options: SendInvoiceEmailOptions = {},
): Promise<SendInvoiceEmailIfNeededResult> {
  const skipIfAlreadySent = options.skipIfAlreadySent !== false;
  if (skipIfAlreadySent && (await hasSuccessfulBillingEmail(invoiceId))) {
    return {
      success: true,
      skipped: true,
      mode: getBillingEmailMode(),
      message: "Email ya registrado como enviado; omitido en sincronización automática.",
    };
  }
  const result = await sendInvoiceEmail(invoiceId, {
    ...options,
    actorType: options.actorType ?? "system",
  });
  return result;
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

  if (env.billingEmail.provider === "resend") {
    return deliverResendEmail(detail, options);
  }

  return {
    success: false,
    mode: getBillingEmailMode(),
    message: `BILLING_EMAIL_PROVIDER="${env.billingEmail.provider ?? ""}" no está implementado. Use BILLING_EMAIL_MODE=mock.`,
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

async function deliverResendEmail(
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
      ? "Reenvío de comprobante (resend) en cola."
      : "Envío de comprobante (resend) en cola.",
    actorType: options.actorType ?? "superadmin",
    actorId: options.actorId ?? null,
    metadata: {
      mode: getBillingEmailMode(),
      source,
      to_email: toEmail ?? null,
      is_resend: isResend,
      provider: "resend",
    },
  });

  if (!toEmail) {
    const log = await insertEmailLog({
      invoiceId: detail.id,
      companyId: detail.company_id,
      toEmail: "—",
      subject,
      status: "failed",
      provider: "resend",
      providerMessageId: null,
      errorMessage: "No hay email de facturación disponible.",
      metadata: {
        mock: false,
        mode: getBillingEmailMode(),
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
      metadata: { mode: "provider", source, email_log_id: log?.id },
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

  const apiKey = env.transactionalEmail.resendApiKey?.trim();
  if (!apiKey) {
    return {
      success: false,
      mode: getBillingEmailMode(),
      message: "Falta RESEND_API_KEY para envío real de comprobantes.",
    };
  }

  const fromAddress = env.transactionalEmail.fromAddress?.trim();
  const fromName = env.transactionalEmail.fromName?.trim() || "Telvoice";
  const replyTo = env.transactionalEmail.replyTo?.trim();
  if (!fromAddress || !fromAddress.includes("@") || !replyTo || !replyTo.includes("@")) {
    return {
      success: false,
      mode: getBillingEmailMode(),
      message: "Faltan EMAIL_FROM_ADDRESS/EMAIL_REPLY_TO válidos para envío de comprobantes.",
    };
  }

  const from = `${fromName} <${fromAddress}>`;

  const now = new Date().toISOString();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject,
        html,
        text,
        reply_to: replyTo,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
      message?: string;
    };

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `Resend error HTTP ${res.status}`;

      const log = await insertEmailLog({
        invoiceId: detail.id,
        companyId: detail.company_id,
        toEmail,
        subject,
        status: "failed",
        provider: "resend",
        providerMessageId: null,
        errorMessage: msg,
        metadata: {
          mode: "provider",
          provider: "resend",
          source,
          is_resend: isResend,
        },
      });

      await recordBillingEvent({
        invoiceId: detail.id,
        companyId: detail.company_id,
        eventType: "invoice.email_failed",
        description: msg,
        actorType: options.actorType ?? "superadmin",
        actorId: options.actorId ?? null,
        metadata: {
          mode: "provider",
          provider: "resend",
          to_email: toEmail,
          source,
          email_log_id: log?.id,
          is_resend: isResend,
        },
      });

      return {
        success: false,
        mode: getBillingEmailMode(),
        emailLogId: log?.id,
        toEmail,
        message: msg,
      };
    }

    const providerMessageId = data?.id ?? null;

    const log = await insertEmailLog({
      invoiceId: detail.id,
      companyId: detail.company_id,
      toEmail,
      subject,
      status: "sent",
      provider: "resend",
      providerMessageId,
      sentAt: now,
      metadata: {
        mode: "provider",
        provider: "resend",
        source,
        is_resend: isResend,
        invoice_number: documentNumber(detail),
      },
    });

    await syncInvoiceStatusAfterEmailSent(detail.id, detail.status);

    await recordBillingEvent({
      invoiceId: detail.id,
      companyId: detail.company_id,
      eventType: "invoice.email_sent",
      description: isResend
        ? "Comprobante reenviado (resend)."
        : "Comprobante enviado (resend).",
      actorType: options.actorType ?? "superadmin",
      actorId: options.actorId ?? null,
      metadata: {
        mode: "provider",
        provider: "resend",
        to_email: toEmail,
        source,
        email_log_id: log?.id,
        is_resend: isResend,
        provider_message_id: providerMessageId,
      },
    });

    return {
      success: true,
      mode: getBillingEmailMode(),
      emailLogId: log?.id,
      toEmail,
      message: isResend
        ? "Reenvío registrado correctamente."
        : "Email de comprobante enviado correctamente.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    const log = await insertEmailLog({
      invoiceId: detail.id,
      companyId: detail.company_id,
      toEmail,
      subject,
      status: "failed",
      provider: "resend",
      providerMessageId: null,
      errorMessage: msg,
      metadata: {
        mode: "provider",
        provider: "resend",
        source,
        is_resend: isResend,
      },
    });

    await recordBillingEvent({
      invoiceId: detail.id,
      companyId: detail.company_id,
      eventType: "invoice.email_failed",
      description: msg,
      actorType: options.actorType ?? "superadmin",
      actorId: options.actorId ?? null,
      metadata: {
        mode: "provider",
        provider: "resend",
        to_email: toEmail,
        source,
        email_log_id: log?.id,
      },
    });

    return {
      success: false,
      mode: getBillingEmailMode(),
      emailLogId: log?.id,
      toEmail,
      message: msg,
    };
  }
}
