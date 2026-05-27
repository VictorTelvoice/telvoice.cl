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

function absolutePublicUrl(pathname: string): string {
  const base = env.publicAppUrl.replace(/\/$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

function emailShell(title: string, bodyHtml: string): string {
  const logoUrl = absolutePublicUrl("/assets/telvoice-isotipo.png");
  const replyTo = escapeHtml(env.transactionalEmail.replyTo);
  const subtitle = escapeHtml(title);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${subtitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,system-ui,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
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
              <p style="margin:12px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.4;color:#ffffff;opacity:0.92;text-align:center">${subtitle}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 28px 28px">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center">
              Este correo fue enviado por Telvoice. Si no realizaste esta compra, contacta a
              <a href="mailto:${replyTo}" style="color:#0052cc;text-decoration:none">${replyTo}</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0;">
    <tr>
      <td align="center" bgcolor="#0052cc" style="background-color:#0052cc;border-radius:8px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="12%" strokecolor="#0052cc" fillcolor="#0052cc">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a
          href="${safeHref}"
          target="_blank"
          style="display:inline-block;padding:14px 32px;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;white-space:nowrap"
        >${safeLabel}</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;
}

function summaryCard(rowsHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:420px;margin:0 auto 24px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
    <tr>
      <td align="center" style="padding:18px 20px;font-family:Segoe UI,system-ui,sans-serif;font-size:13px;line-height:1.7;color:#334155;text-align:center">
        ${rowsHtml}
      </td>
    </tr>
  </table>`;
}

export function renderPaymentReceivedPendingClaim(
  data: PaymentPendingClaimTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Pago recibido — activa tu cuenta Telvoice";
  const amount = fmtMoney(data.amount, data.currency);
  const sms = fmtSms(data.smsQuantity);

  const summaryRows = `
    <div><strong>Bolsa:</strong> ${escapeHtml(data.packageName)}</div>
    <div><strong>SMS:</strong> ${escapeHtml(sms)}</div>
    <div><strong>Monto:</strong> ${escapeHtml(amount)}</div>
    <div><strong>Orden:</strong> ${escapeHtml(data.orderRef)}</div>
  `;

  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      ¡Hola! Hemos recibido tu pago.
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:480px;margin-left:auto;margin-right:auto">
      Para usar tus SMS, activa tu cuenta con Google usando el mismo correo que utilizaste al pagar.
    </p>
    ${summaryCard(summaryRows)}
    ${ctaButton(data.claimUrl, "Activar cuenta con Google")}
    <p style="margin:20px auto 0;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center;max-width:480px">
      Si el botón no funciona, copia este enlace en tu navegador:<br />
      <a href="${escapeHtml(data.claimUrl)}" style="color:#0052cc;word-break:break-all;text-decoration:none">${escapeHtml(data.claimUrl)}</a>
    </p>`;

  const text = [
    "¡Hola! Hemos recibido tu pago.",
    "",
    "Para usar tus SMS, activa tu cuenta con Google usando el mismo correo que utilizaste al pagar.",
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

  const summaryRows = `
    <div><strong>Bolsa:</strong> ${escapeHtml(data.packageName)}</div>
    <div><strong>SMS acreditados:</strong> ${escapeHtml(sms)}</div>
    <div><strong>Saldo disponible:</strong> ${escapeHtml(balance)} SMS</div>
  `;

  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      ¡Hola! Tus SMS ya están disponibles.
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:480px;margin-left:auto;margin-right:auto">
      Tu cuenta está lista y acreditamos tu bolsa de SMS en el wallet.
    </p>
    ${summaryCard(summaryRows)}
    ${ctaButton(data.dashboardUrl, "Ir al dashboard")}`;

  const text = [
    "¡Hola! Tus SMS ya están disponibles.",
    "",
    "Tu cuenta está lista y acreditamos tu bolsa de SMS en el wallet.",
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
