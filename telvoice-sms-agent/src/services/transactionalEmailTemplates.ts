import { env } from "../config/env.js";
import { escapeHtml } from "../utils/html.js";
import { formatOrderShortId } from "../utils/order-display.js";
import { buildClaimActivationUrl } from "../utils/claim-token.js";

export type PaymentPendingClaimTemplateData = {
  recipientName: string;
  packageName: string;
  smsQuantity: number;
  amount: number;
  currency: string;
  orderId: string;
  orderRef: string;
  claimUrl: string;
};

export type WelcomeSmsCreditedTemplateData = {
  recipientName: string;
  packageName: string;
  smsCredited: number;
  availableBalance: number;
  dashboardUrl: string;
};

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

function emailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,system-ui,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <tr><td style="background:#0052cc;color:#fff;padding:24px 28px">
          <div style="font-size:22px;font-weight:800">${escapeHtml(env.transactionalEmail.fromName)}</div>
          <div style="font-size:14px;opacity:0.9;margin-top:4px">${escapeHtml(title)}</div>
        </td></tr>
        <tr><td style="padding:28px">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
          Este correo fue enviado por Telvoice. Si no realizaste esta compra, contacta a ${escapeHtml(env.transactionalEmail.replyTo)}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<p style="margin:24px 0 0;text-align:center">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#0052cc;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px">${escapeHtml(label)}</a>
  </p>`;
}

export function renderPaymentReceivedPendingClaim(
  data: PaymentPendingClaimTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Pago recibido — activa tu cuenta Telvoice";
  const amount = fmtMoney(data.amount, data.currency);
  const sms = fmtSms(data.smsQuantity);

  const body = `
    <p style="margin:0 0 16px;font-size:15px">Hola <strong>${escapeHtml(data.recipientName)}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#334155">
      Recibimos tu pago. Para usar tus SMS, activa tu cuenta con Google (mismo correo que usaste al pagar).
    </p>
    <table role="presentation" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px">
      <tr><td style="padding:16px;font-size:13px;line-height:1.7">
        <div><strong>Bolsa:</strong> ${escapeHtml(data.packageName)}</div>
        <div><strong>SMS:</strong> ${escapeHtml(sms)}</div>
        <div><strong>Monto:</strong> ${escapeHtml(amount)}</div>
        <div><strong>Orden:</strong> ${escapeHtml(data.orderRef)}</div>
      </td></tr>
    </table>
    ${ctaButton(data.claimUrl, "Activar cuenta con Google")}
    <p style="margin:20px 0 0;font-size:12px;color:#64748b;line-height:1.5">
      Si el botón no funciona, copia este enlace en tu navegador:<br />
      <a href="${escapeHtml(data.claimUrl)}" style="color:#0052cc;word-break:break-all">${escapeHtml(data.claimUrl)}</a>
    </p>`;

  const text = [
    `Hola ${data.recipientName},`,
    "",
    "Recibimos tu pago. Activa tu cuenta con Google para usar tus SMS.",
    "",
    `Bolsa: ${data.packageName}`,
    `SMS: ${sms}`,
    `Monto: ${amount}`,
    `Orden: ${data.orderRef}`,
    "",
    `Activar: ${data.claimUrl}`,
  ].join("\n");

  return { subject, html: emailShell("Pago recibido", body), text };
}

export function renderWelcomeSmsCredited(
  data: WelcomeSmsCreditedTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Bienvenido a Telvoice — tus SMS ya están disponibles";
  const sms = fmtSms(data.smsCredited);
  const balance = fmtSms(data.availableBalance);

  const body = `
    <p style="margin:0 0 16px;font-size:15px">Hola <strong>${escapeHtml(data.recipientName)}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#334155">
      Tu cuenta está lista y acreditamos tu bolsa de SMS en el wallet.
    </p>
    <table role="presentation" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
      <tr><td style="padding:16px;font-size:13px;line-height:1.7">
        <div><strong>Bolsa:</strong> ${escapeHtml(data.packageName)}</div>
        <div><strong>SMS acreditados:</strong> ${escapeHtml(sms)}</div>
        <div><strong>Saldo disponible:</strong> ${escapeHtml(balance)} SMS</div>
      </td></tr>
    </table>
    ${ctaButton(data.dashboardUrl, "Ir al dashboard")}`;

  const text = [
    `Hola ${data.recipientName},`,
    "",
    "Bienvenido a Telvoice. Tus SMS ya están disponibles.",
    "",
    `Bolsa: ${data.packageName}`,
    `SMS acreditados: ${sms}`,
    `Saldo disponible: ${balance} SMS`,
    "",
    `Dashboard: ${data.dashboardUrl}`,
  ].join("\n");

  return { subject, html: emailShell("Bienvenida", body), text };
}

export function buildPaymentClaimUrlFromToken(claimToken: string): string {
  return buildClaimActivationUrl(claimToken);
}

export function orderRefLabel(orderId: string, publicRef?: string | null): string {
  return publicRef?.trim() || formatOrderShortId(orderId);
}
