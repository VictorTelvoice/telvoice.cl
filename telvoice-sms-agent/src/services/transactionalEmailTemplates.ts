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

export type PurchaseActivationNoticeTemplateData = {
  customerName: string;
  smsQuantity: number;
  walletBalance: number;
  ratePlanName: string;
  orderId: string;
  orderRef: string;
  invoiceNumber: string;
  appLoginUrl: string;
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

export function renderPurchaseActivationNotice(
  data: PurchaseActivationNoticeTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Tu bolsa SMS Telvoice ya está activa";
  const smsQty = fmtSms(data.smsQuantity);
  const balance = fmtSms(data.walletBalance);

  const summaryRows = `
    <div><strong>Bolsa activada:</strong> ${escapeHtml(smsQty)} SMS</div>
    <div><strong>Saldo actual disponible:</strong> ${escapeHtml(balance)} SMS</div>
    <div><strong>Plan aplicado:</strong> ${escapeHtml(data.ratePlanName)}</div>
    <div><strong>Orden:</strong> ${escapeHtml(data.orderRef)}</div>
    <div><strong>Comprobante:</strong> ${escapeHtml(data.invoiceNumber)}</div>
  `;

  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Hola ${escapeHtml(data.customerName)},
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:480px;margin-left:auto;margin-right:auto">
      Tu pago fue validado correctamente y tu bolsa SMS ya quedó activa en Telvoice.
    </p>
    ${summaryCard(summaryRows)}
    ${ctaButton(data.appLoginUrl, "Ingresar al panel")}`;

  const text = [
    `Hola ${data.customerName},`,
    "",
    "Tu pago fue validado y tu bolsa SMS ya quedó activa en Telvoice.",
    "",
    `Bolsa activada: ${smsQty} SMS`,
    `Saldo disponible: ${balance} SMS`,
    `Plan: ${data.ratePlanName}`,
    `Orden: ${data.orderRef}`,
    `Comprobante: ${data.invoiceNumber}`,
    "",
    data.appLoginUrl,
  ].join("\n");

  return { subject, html: emailShell("Bolsa SMS activada", body), text };
}

export function buildPaymentClaimUrlFromToken(claimToken: string): string {
  return buildClaimActivationUrl(claimToken);
}

export function orderRefLabel(orderId: string, publicRef?: string | null): string {
  return publicRef?.trim() || formatOrderShortId(orderId);
}

export type SimPaymentReceivedTemplateData = {
  recipientName: string;
  planName: string;
  includedSmsMonthly: number;
  amount: number;
  currency: string;
  orderRef: string;
  claimUrl: string;
};

export function renderSimPaymentReceivedPendingActivation(
  data: SimPaymentReceivedTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Pago recibido — activación de numeración SIM real en proceso";
  const sms = fmtSms(data.includedSmsMonthly);
  const total = fmtMoney(data.amount, data.currency);

  const summaryRows = `
    <div><strong>Plan:</strong> ${escapeHtml(data.planName)}</div>
    <div><strong>SMS salientes incluidos:</strong> ${escapeHtml(sms)} / mes</div>
    <div><strong>Total pagado:</strong> ${escapeHtml(total)}</div>
    <div><strong>Orden:</strong> ${escapeHtml(data.orderRef)}</div>
  `;

  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Hola ${escapeHtml(data.recipientName)}, recibimos tu pago.
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Confirmamos el pago de tu plan de numeración SIM real. Telvoice revisará tu caso de uso,
      la disponibilidad de numeración y activará tu línea desde el panel. Este proceso requiere
      validación comercial y no es automático.
    </p>
    ${summaryCard(summaryRows)}
    <p style="margin:0 0 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center">
      Para asociar la compra a tu panel Telvoice, activa tu cuenta con Google usando el mismo correo de la compra.
    </p>
    ${ctaButton(data.claimUrl, "Ingresar al panel Telvoice")}`;

  const text = [
    `Hola ${data.recipientName}, recibimos tu pago.`,
    "",
    `Plan: ${data.planName}`,
    `SMS incluidos: ${sms} / mes`,
    `Total: ${total}`,
    `Orden: ${data.orderRef}`,
    "",
    "Telvoice revisará disponibilidad y activará tu numeración SIM real.",
    "",
    `Activar cuenta: ${data.claimUrl}`,
  ].join("\n");

  return { subject, html: emailShell("Numeración SIM", body), text };
}

export type SimOpsNotifyTemplateData = {
  planName: string;
  planId: string;
  includedSmsMonthly: number;
  amount: number;
  currency: string;
  orderId: string;
  orderRef: string;
  checkoutEmail: string;
  payerName: string | null;
  companyName: string | null;
  phone: string | null;
  taxId: string | null;
  adminUrl: string;
};

export function renderSimOpsPendingActivation(
  data: SimOpsNotifyTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Nueva compra de Numeración SIM real pendiente de activación";
  const sms = fmtSms(data.includedSmsMonthly);
  const total = fmtMoney(data.amount, data.currency);

  const rowPairs: [string, string][] = [
    ["Plan", data.planName],
    ["Plan ID", data.planId],
    ["SMS incluidos", `${sms} / mes`],
    ["Monto", total],
    ["Email", data.checkoutEmail],
    ["Nombre", data.payerName ?? "—"],
    ["Empresa", data.companyName ?? "—"],
    ["Teléfono", data.phone ?? "—"],
    ["RUT", data.taxId ?? "—"],
    ["Orden", data.orderRef],
    ["Order ID", data.orderId],
  ];
  const rowsHtml = rowPairs
    .map(
      ([label, value]) =>
        `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</div>`,
    )
    .join("");

  const body = `
    <p style="margin:0 0 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.55;color:#334155">
      Se aprobó un pago Mercado Pago para numeración SIM real. Requiere activación manual.
    </p>
    ${summaryCard(rowsHtml)}
    ${ctaButton(data.adminUrl, "Ver activaciones pendientes")}`;

  const text = [
    subject,
    "",
    ...rowPairs.map(([label, value]) => `${label}: ${value}`),
    "",
    data.adminUrl,
  ].join("\n");

  return { subject, html: emailShell("Activación SIM pendiente", body), text };
}

export type SimAgentBundleCustomerTemplateData = {
  recipientName: string;
  simPlanName: string;
  agentPlanName: string | null;
  includedSmsMonthly: number;
  amount: number;
  currency: string;
  orderRef: string;
  panelUrl: string;
};

export function renderSimAgentBundlePaymentReceived(
  data: SimAgentBundleCustomerTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Recibimos tu compra Telvoice";
  const sms = fmtSms(data.includedSmsMonthly);
  const total = fmtMoney(data.amount, data.currency);
  const bundleLabel = data.agentPlanName
    ? `${data.simPlanName} + ${data.agentPlanName}`
    : data.simPlanName;

  const summaryRows = `
    <div><strong>Plan:</strong> ${escapeHtml(bundleLabel)}</div>
    <div><strong>SMS salientes incluidos:</strong> ${escapeHtml(sms)} / mes</div>
    <div><strong>Total pagado:</strong> ${escapeHtml(total)}</div>
    <div><strong>Orden:</strong> ${escapeHtml(data.orderRef)}</div>
    <div><strong>Estado:</strong> Pago confirmado — activación en curso</div>
  `;

  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Hola ${escapeHtml(data.recipientName)}, recibimos tu compra Telvoice.
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Confirmamos tu pago para ${escapeHtml(bundleLabel)}.
      Estamos preparando tu numeración y el acceso al panel.
    </p>
    ${summaryCard(summaryRows)}
    <p style="margin:0 0 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center">
      Te avisaremos por correo cuando tu numeración quede activa. Mientras tanto puedes revisar el estado en el panel.
    </p>
    ${ctaButton(data.panelUrl, "Ir a mi panel")}`;

  const text = [
    `Hola ${data.recipientName}, recibimos tu compra Telvoice.`,
    "",
    `Plan: ${bundleLabel}`,
    `SMS incluidos: ${sms} / mes`,
    `Total: ${total}`,
    `Orden: ${data.orderRef}`,
    "Estado: Pago confirmado — activación en curso",
    "",
    "Te avisaremos cuando tu numeración quede activa.",
    data.panelUrl,
  ].join("\n");

  return { subject, html: emailShell("Compra Telvoice confirmada", body), text };
}

export type SimAgentBundleOpsTemplateData = SimOpsNotifyTemplateData & {
  agentPlanName: string | null;
  agentAddonId: string | null;
  useCase: string | null;
  identityReviewRequired: boolean;
};

export function renderSimAgentBundleOpsPendingActivation(
  data: SimAgentBundleOpsTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Nueva compra SIM + Agente pendiente de activación";
  const sms = fmtSms(data.includedSmsMonthly);
  const total = fmtMoney(data.amount, data.currency);

  const rowPairs: [string, string][] = [
    ["Plan SIM", data.planName],
    ["Plan SIM ID", data.planId],
    ["Agente", data.agentPlanName ?? "Solo numeración"],
    ["Agente ID", data.agentAddonId ?? "none"],
    ["SMS incluidos", `${sms} / mes`],
    ["Monto", total],
    ["Email", data.checkoutEmail],
    ["Nombre", data.payerName ?? "—"],
    ["Empresa", data.companyName ?? "—"],
    ["Teléfono", data.phone ?? "—"],
    ["RUT", data.taxId ?? "—"],
    ["Caso de uso", data.useCase ?? "—"],
    ["Revisión identidad", data.identityReviewRequired ? "Sí" : "No"],
    ["Orden", data.orderRef],
    ["Order ID", data.orderId],
  ];
  const rowsHtml = rowPairs
    .map(
      ([label, value]) =>
        `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</div>`,
    )
    .join("");

  const body = `
    <p style="margin:0 0 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.55;color:#334155">
      Nueva compra SIM + Agente desde el landing. Requiere activación manual.
    </p>
    ${summaryCard(rowsHtml)}
    ${ctaButton(data.adminUrl, "Ver activaciones pendientes")}`;

  const text = [subject, "", ...rowPairs.map(([label, value]) => `${label}: ${value}`), "", data.adminUrl].join("\n");

  return { subject, html: emailShell("SIM + Agente pendiente", body), text };
}

export type CheckoutPanelAccessTemplateData = {
  recipientName: string;
  recipientEmail: string;
  accessUrl: string;
};

export function renderCheckoutPanelAccess(
  data: CheckoutPanelAccessTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Accede a tu panel Telvoice";
  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Hola ${escapeHtml(data.recipientName)}, tu panel Telvoice está listo.
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Creamos tu cuenta con el correo <strong>${escapeHtml(data.recipientEmail)}</strong>.
      Usa el botón para entrar de forma segura (enlace de un solo uso, sin contraseña en texto plano).
    </p>
    ${ctaButton(data.accessUrl, "Acceder a mi panel")}
    <p style="margin:16px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center">
      Si el botón no funciona, copia este enlace en tu navegador:<br />
      <span style="word-break:break-all">${escapeHtml(data.accessUrl)}</span>
    </p>`;

  const text = [
    subject,
    "",
    `Hola ${data.recipientName},`,
    "",
    `Cuenta: ${data.recipientEmail}`,
    "",
    "Accede a tu panel con este enlace seguro (un solo uso):",
    data.accessUrl,
  ].join("\n");

  return { subject, html: emailShell("Acceso al panel", body), text };
}

export type SimNumberActiveTemplateData = {
  recipientName: string;
  assignedNumber: string;
  planName: string;
  numeracionesUrl: string;
  inboxUrl: string;
  orderRef: string;
};

export function renderSimNumberActive(
  data: SimNumberActiveTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Tu numeración Telvoice ya está activa";
  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Tu numeración Telvoice ya está activa
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Hola ${escapeHtml(data.recipientName)}, tu número Telvoice ya está activo y listo para recibir SMS.
    </p>
    ${summaryCard(`
      <div><strong>Número asignado:</strong> ${escapeHtml(data.assignedNumber)}</div>
      <div><strong>Plan:</strong> ${escapeHtml(data.planName)}</div>
      <div><strong>Orden:</strong> ${escapeHtml(data.orderRef)}</div>
    `)}
    <p style="margin:0 0 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center">
      Desde tu panel puedes revisar SMS entrantes, operar con el agente Telvoice y configurar integraciones.
    </p>
    ${ctaButton(data.inboxUrl, "Ver SMS entrantes")}
    <p style="margin:12px 0 0;text-align:center">
      <a href="${escapeHtml(data.numeracionesUrl)}" style="font-family:Segoe UI,system-ui,sans-serif;font-size:14px;color:#0052cc">Ir a Mis numeraciones</a>
    </p>`;

  const text = [
    "Tu numeración Telvoice ya está activa y listo para recibir SMS.",
    "",
    `Número asignado: ${data.assignedNumber}`,
    `Plan: ${data.planName}`,
    `Orden: ${data.orderRef}`,
    "",
    "Desde tu panel puedes revisar SMS entrantes, operar con el agente Telvoice y configurar integraciones.",
    "",
    data.inboxUrl,
    data.numeracionesUrl,
  ].join("\n");

  return { subject, html: emailShell("Numeración activa", body), text };
}

export type SimSubscriptionPaymentConfirmedTemplateData = {
  contactName: string;
  planName: string;
  assignedNumber: string | null;
  includedSmsMonthly: number;
  includesOutboundSms?: boolean;
  amount: number;
  currency: string;
  billingCycle: string;
  nextRenewal: string | null;
  numeracionesUrl: string;
};

export function renderSimSubscriptionPaymentConfirmed(
  data: SimSubscriptionPaymentConfirmedTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Tu numeración SIM Telvoice fue activada";
  const includesSms =
    data.includesOutboundSms !== false && Math.round(Number(data.includedSmsMonthly) || 0) > 0;
  const sms = fmtSms(data.includedSmsMonthly);
  const smsHtml = includesSms
    ? `<div><strong>SMS incluidos:</strong> ${escapeHtml(sms)} / mes</div>`
    : `<div><strong>SMS salientes:</strong> esta suscripción no incluye bolsa mensual de SMS salientes.</div>`;
  const smsText = includesSms
    ? `SMS incluidos: ${sms} / mes`
    : "SMS salientes: esta suscripción no incluye bolsa mensual de SMS salientes.";
  const total = fmtMoney(data.amount, data.currency);
  const numberLine = data.assignedNumber
    ? `<div><strong>Numeración asignada:</strong> ${escapeHtml(data.assignedNumber)}</div>`
    : `<div><strong>Numeración:</strong> en activación — revisa el panel en unos minutos</div>`;

  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Hola ${escapeHtml(data.contactName)},
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Tu suscripción <strong>${escapeHtml(data.planName)}</strong> fue confirmada.
    </p>
    ${summaryCard(`
      <div><strong>Plan:</strong> ${escapeHtml(data.planName)}</div>
      ${numberLine}
      ${smsHtml}
      <div><strong>Monto:</strong> ${escapeHtml(total)}</div>
      <div><strong>Ciclo:</strong> ${escapeHtml(data.billingCycle)}</div>
      ${data.nextRenewal ? `<div><strong>Próxima renovación:</strong> ${escapeHtml(data.nextRenewal)}</div>` : ""}
    `)}
    ${ctaButton(data.numeracionesUrl, "Ir a Mis numeraciones")}
    <p style="margin:16px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:13px;line-height:1.5;color:#64748b;text-align:center">
      Si necesitas ayuda, responde este correo o contacta soporte.
    </p>`;

  const text = [
    `Hola ${data.contactName},`,
    "",
    `Tu suscripción ${data.planName} fue confirmada.`,
    "",
    `Plan: ${data.planName}`,
    data.assignedNumber ? `Numeración asignada: ${data.assignedNumber}` : "Numeración: en activación",
    smsText,
    `Monto: ${total}`,
    `Ciclo: ${data.billingCycle}`,
    data.nextRenewal ? `Próxima renovación: ${data.nextRenewal}` : "",
    "",
    `Panel: ${data.numeracionesUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html: emailShell("Numeración SIM activada", body), text };
}

export type SimSubscriptionInternalAlertTemplateData = {
  companyName: string | null;
  checkoutEmail: string;
  planName: string;
  assignedNumber: string | null;
  amount: number;
  currency: string;
  preapprovalId: string | null;
  orderId: string;
  adminUrl: string;
};

export function renderSimSubscriptionInternalAlert(
  data: SimSubscriptionInternalAlertTemplateData,
): { subject: string; html: string; text: string } {
  const subject = `[Telvoice] Suscripción SIM activada — ${data.checkoutEmail}`;
  const total = fmtMoney(data.amount, data.currency);
  const rowsHtml = [
    ["Empresa", data.companyName ?? "—"],
    ["Email", data.checkoutEmail],
    ["Plan", data.planName],
    ["Número", data.assignedNumber ?? "pendiente"],
    ["Monto", total],
    ["MP preapproval", data.preapprovalId ?? "—"],
    ["Order ID", data.orderId],
  ]
    .map(
      ([label, value]) =>
        `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</div>`,
    )
    .join("");

  const body = `
    <p style="margin:0 0 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.55;color:#334155">
      Se confirmó y activó una suscripción de numeración SIM (panel cliente).
    </p>
    ${summaryCard(rowsHtml)}
    ${ctaButton(data.adminUrl, "Ver en admin")}`;

  const text = [
    "Suscripción SIM activada",
    "",
    ...[
      ["Empresa", data.companyName ?? "—"],
      ["Email", data.checkoutEmail],
      ["Plan", data.planName],
      ["Número", data.assignedNumber ?? "pendiente"],
      ["Monto", total],
      ["MP preapproval", data.preapprovalId ?? "—"],
      ["Order ID", data.orderId],
    ].map(([k, v]) => `${k}: ${v}`),
    "",
    data.adminUrl,
  ].join("\n");

  return { subject, html: emailShell("Alerta suscripción SIM", body), text };
}

export type SimActivationInProgressTemplateData = {
  recipientName: string;
  planName: string;
  orderRef: string;
  panelUrl: string;
};

export function renderSimActivationInProgress(
  data: SimActivationInProgressTemplateData,
): { subject: string; html: string; text: string } {
  const subject = "Tu numeración Telvoice está en activación";
  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Activación en curso
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Hola ${escapeHtml(data.recipientName)}, confirmamos tu pago.
      Estamos finalizando la activación técnica de tu numeración Telvoice.
    </p>
    ${summaryCard(`
      <div><strong>Plan:</strong> ${escapeHtml(data.planName)}</div>
      <div><strong>Referencia:</strong> ${escapeHtml(data.orderRef)}</div>
      <div><strong>Estado:</strong> Activación en curso</div>
      <div><strong>Tiempo estimado:</strong> habitualmente el mismo día hábil</div>
    `)}
    ${ctaButton(data.panelUrl, "Ver estado en el panel")}`;

  const text = [
    subject,
    "",
    `Plan: ${data.planName}`,
    `Referencia: ${data.orderRef}`,
    "Estado: Activación en curso",
    "",
    data.panelUrl,
  ].join("\n");

  return { subject, html: emailShell("Activación en curso", body), text };
}

export type SupportTicketReplyToClientTemplateData = {
  ticketCode: string;
  subject: string;
  statusLabel: string;
  companyName: string;
  replyMessage: string;
  authorName: string;
  panelUrl: string;
  updatedAt: string;
};

function fmtSupportDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Santiago",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function renderSupportTicketReplyToClient(
  data: SupportTicketReplyToClientTemplateData,
): { subject: string; html: string; text: string } {
  const subject = `Nueva respuesta a tu ticket ${data.ticketCode} — Telvoice`;
  const when = fmtSupportDate(data.updatedAt);
  const summaryRows = `
    <div><strong>Ticket:</strong> ${escapeHtml(data.ticketCode)}</div>
    <div><strong>Asunto:</strong> ${escapeHtml(data.subject)}</div>
    <div><strong>Estado:</strong> ${escapeHtml(data.statusLabel)}</div>
    <div><strong>Empresa:</strong> ${escapeHtml(data.companyName)}</div>
    <div><strong>Actualizado:</strong> ${escapeHtml(when)}</div>
  `;
  const replyHtml = escapeHtml(data.replyMessage).replace(/\n/g, "<br />");

  const body = `
    <p style="margin:0 0 16px;text-align:center">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.02em">Soporte Telvoice</span>
    </p>
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Nueva respuesta a tu ticket ${escapeHtml(data.ticketCode)}
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Nuestro equipo respondió tu solicitud de soporte.
    </p>
    ${summaryCard(summaryRows)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:520px;margin:0 auto 24px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
      <tr>
        <td style="padding:18px 20px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;text-align:left">
          <div style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:8px">${escapeHtml(data.authorName)}</div>
          <div>${replyHtml}</div>
        </td>
      </tr>
    </table>
    ${ctaButton(data.panelUrl, "Ver y responder ticket en mi panel")}
    <p style="margin:16px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:13px;line-height:1.55;color:#64748b;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Para mantener el historial completo, responde desde tu panel Telvoice.
    </p>
    <p style="margin:16px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center">
      Si el botón no funciona, copia este enlace en tu navegador:<br />
      <a href="${escapeHtml(data.panelUrl)}" style="color:#0052cc;word-break:break-all;text-decoration:none">${escapeHtml(data.panelUrl)}</a>
    </p>`;

  const text = [
    subject,
    "",
    "Nuestro equipo respondió tu solicitud de soporte.",
    "",
    `Ticket: ${data.ticketCode}`,
    `Asunto: ${data.subject}`,
    `Estado: ${data.statusLabel}`,
    `Empresa: ${data.companyName}`,
    `Actualizado: ${when}`,
    "",
    `${data.authorName}:`,
    data.replyMessage,
    "",
    "Para mantener el historial completo, responde desde tu panel Telvoice.",
    "",
    `Ver y responder ticket: ${data.panelUrl}`,
  ].join("\n");

  return { subject, html: emailShell("Soporte Telvoice", body), text };
}

export type SupportTicketClientReplyToAdminTemplateData = {
  ticketCode: string;
  subject: string;
  statusLabel: string;
  companyName: string;
  clientEmail: string;
  clientName: string;
  replyMessage: string;
  panelUrl: string;
  updatedAt: string;
};

export function renderSupportTicketClientReplyToAdmin(
  data: SupportTicketClientReplyToAdminTemplateData,
): { subject: string; html: string; text: string } {
  const subject = `Cliente respondió el ticket ${data.ticketCode} — Telvoice`;
  const when = fmtSupportDate(data.updatedAt);
  const summaryRows = `
    <div><strong>Ticket:</strong> ${escapeHtml(data.ticketCode)}</div>
    <div><strong>Empresa:</strong> ${escapeHtml(data.companyName)}</div>
    <div><strong>Cliente:</strong> ${escapeHtml(data.clientName)}</div>
    <div><strong>Correo:</strong> ${escapeHtml(data.clientEmail)}</div>
    <div><strong>Asunto:</strong> ${escapeHtml(data.subject)}</div>
    <div><strong>Estado:</strong> ${escapeHtml(data.statusLabel)}</div>
    <div><strong>Fecha:</strong> ${escapeHtml(when)}</div>
  `;
  const replyHtml = escapeHtml(data.replyMessage).replace(/\n/g, "<br />");

  const body = `
    <p style="margin:0 0 16px;text-align:center">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.02em">Soporte Telvoice</span>
    </p>
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Cliente respondió el ticket ${escapeHtml(data.ticketCode)}
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Hay una nueva respuesta pendiente de revisión.
    </p>
    ${summaryCard(summaryRows)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:520px;margin:0 auto 24px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px">
      <tr>
        <td style="padding:18px 20px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;text-align:left">
          <div style="font-size:12px;font-weight:700;color:#c2410c;margin-bottom:8px">${escapeHtml(data.clientName)}</div>
          <div>${replyHtml}</div>
        </td>
      </tr>
    </table>
    ${ctaButton(data.panelUrl, "Ver ticket en superadmin")}
    <p style="margin:16px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center">
      Si el botón no funciona, copia este enlace en tu navegador:<br />
      <a href="${escapeHtml(data.panelUrl)}" style="color:#0052cc;word-break:break-all;text-decoration:none">${escapeHtml(data.panelUrl)}</a>
    </p>`;

  const text = [
    subject,
    "",
    "Hay una nueva respuesta pendiente de revisión.",
    "",
    `Ticket: ${data.ticketCode}`,
    `Empresa: ${data.companyName}`,
    `Cliente: ${data.clientName}`,
    `Correo: ${data.clientEmail}`,
    `Asunto: ${data.subject}`,
    `Estado: ${data.statusLabel}`,
    `Fecha: ${when}`,
    "",
    `${data.clientName}:`,
    data.replyMessage,
    "",
    `Ver ticket en superadmin: ${data.panelUrl}`,
  ].join("\n");

  return { subject, html: emailShell("Soporte Telvoice", body), text };
}

export type NewCustomerPurchaseInternalAlertData = {
  companyName: string;
  buyerEmail: string;
  whatsapp: string;
  taxId: string;
  legalName: string;
  packageName: string;
  smsQuantity: number;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  orderStatusLabel: string;
  walletStatusLabel: string;
  orderRef: string;
  orderId: string;
  mercadoPagoPaymentId: string | null;
  purchasedAt: string;
  isConfirmedNewCustomer: boolean;
  probableNewCustomer: boolean;
  adminClientUrl: string;
  adminOrderUrl: string;
};

function emailBadge(label: string, bg: string): string {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.02em;background:${bg};color:#fff">${escapeHtml(label)}</span>`;
}

export function renderNewCustomerPurchaseInternalAlert(
  data: NewCustomerPurchaseInternalAlertData,
): { subject: string; html: string; text: string } {
  const subject = `Nuevo cliente compró SMS en Telvoice — ${data.companyName}`;
  const smsLabel = fmtSms(data.smsQuantity);
  const net = fmtMoney(data.netAmount, data.currency);
  const tax = fmtMoney(data.taxAmount, data.currency);
  const total = fmtMoney(data.totalAmount, data.currency);
  let when = data.purchasedAt;
  try {
    when = new Date(data.purchasedAt).toLocaleString("es-CL", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    /* keep raw */
  }

  const badges = [
    emailBadge("Nueva compra online", "#0052cc"),
    data.isConfirmedNewCustomer
      ? emailBadge("Cliente nuevo", "#059669")
      : emailBadge("Cliente nuevo probable", "#d97706"),
    emailBadge("Solo superadmin", "#64748b"),
  ].join("");

  const rowPairs: [string, string][] = [
    ["Empresa / comprador", data.companyName],
    ["Razón social", data.legalName],
    ["Email", data.buyerEmail],
    ["WhatsApp", data.whatsapp],
    ["RUT", data.taxId],
    ["Bolsa comprada", `${data.packageName} (${smsLabel} SMS)`],
    ["Monto neto", net],
    ["IVA", tax],
    ["Total pagado", total],
    ["Estado orden", data.orderStatusLabel],
    ["Wallet / acreditación", data.walletStatusLabel],
    ["Order code", data.orderRef],
    ["Order ID", data.orderId],
    ["MercadoPago payment id", data.mercadoPagoPaymentId ?? "—"],
    ["Fecha / hora", when],
  ];

  const rowsHtml = rowPairs
    .map(
      ([label, value]) =>
        `<div style="margin-bottom:6px"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</div>`,
    )
    .join("");

  const body = `
    <div style="text-align:center;margin-bottom:16px">${badges}</div>
    <h2 style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:18px;line-height:1.35;color:#0f172a;text-align:center">
      Nuevo cliente registrado con compra SMS
    </h2>
    <p style="margin:0 0 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center">
      Se acreditó una bolsa SMS tras pago aprobado en checkout Telvoice.
    </p>
    ${summaryCard(rowsHtml)}
    ${ctaButton(data.adminClientUrl, "Ver cliente en superadmin")}
    ${ctaButton(data.adminOrderUrl, "Ver orden en superadmin")}`;

  const text = [
    subject,
    "",
    "Nuevo cliente registrado con compra SMS",
    "",
    ...rowPairs.map(([label, value]) => `${label}: ${value}`),
    "",
    `Ver cliente: ${data.adminClientUrl}`,
    `Ver orden: ${data.adminOrderUrl}`,
  ].join("\n");

  return {
    subject,
    html: emailShell("Alerta compra cliente nuevo", body),
    text,
  };
}

export type LandingContactLeadAdminAlertData = {
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  message: string;
  pageUrl: string | null;
};

export function renderLandingContactLeadAdminAlert(
  data: LandingContactLeadAdminAlertData,
): { subject: string; html: string; text: string } {
  const subject = `[Telvoice] Consulta landing — ${data.contactName}`;
  const summaryRows = `
    <div><strong>Nombre o empresa:</strong> ${escapeHtml(data.contactName)}</div>
    <div><strong>Correo:</strong> ${escapeHtml(data.contactEmail)}</div>
    <div><strong>Teléfono:</strong> ${escapeHtml(data.contactPhone || "—")}</div>
    <div><strong>Origen:</strong> Formulario contacto — telvoice.cl</div>
    ${data.pageUrl ? `<div><strong>Página:</strong> ${escapeHtml(data.pageUrl)}</div>` : ""}
  `;
  const messageHtml = escapeHtml(data.message).replace(/\n/g, "<br />");
  const replyUrl = `mailto:${encodeURIComponent(data.contactEmail)}?subject=${encodeURIComponent("Re: tu consulta en Telvoice")}`;

  const body = `
    <p style="margin:0 0 16px;text-align:center">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.02em">Formulario contacto</span>
    </p>
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Nueva consulta desde telvoice.cl
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      ${escapeHtml(data.contactName)} envió una solicitud desde el formulario de contacto del landing.
    </p>
    ${summaryCard(summaryRows)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:520px;margin:0 auto 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
      <tr>
        <td style="padding:18px 20px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;text-align:left">
          <div style="font-size:12px;font-weight:700;color:#0052cc;margin-bottom:8px">Mensaje</div>
          <div>${messageHtml}</div>
        </td>
      </tr>
    </table>
    ${ctaButton(replyUrl, "Responder por correo")}`;

  const text = [
    subject,
    "",
    "Nueva consulta desde telvoice.cl",
    "",
    `Nombre o empresa: ${data.contactName}`,
    `Correo: ${data.contactEmail}`,
    `Teléfono: ${data.contactPhone || "—"}`,
    "Origen: Formulario contacto — telvoice.cl",
    data.pageUrl ? `Página: ${data.pageUrl}` : null,
    "",
    "Mensaje:",
    data.message,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html: emailShell("Consulta landing", body), text };
}

export type LandingContactLeadClientConfirmationData = {
  contactName: string;
  message: string;
  siteUrl: string;
};

export function renderLandingContactLeadClientConfirmation(
  data: LandingContactLeadClientConfirmationData,
): { subject: string; html: string; text: string } {
  const firstName = data.contactName.split(/\s+/)[0] || data.contactName;
  const subject = "Recibimos tu consulta — Telvoice";
  const messageHtml = escapeHtml(data.message).replace(/\n/g, "<br />");
  const siteUrl = data.siteUrl.replace(/\/$/, "");

  const body = `
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Hola ${escapeHtml(firstName)},
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      Recibimos tu consulta en Telvoice. Nuestro equipo la revisará y te contactaremos pronto.
    </p>
    ${summaryCard(`
      <div><strong>Resumen de tu mensaje</strong></div>
      <div style="margin-top:10px;text-align:left">${messageHtml}</div>
    `)}
    ${ctaButton(siteUrl, "Visitar telvoice.cl")}
    <p style="margin:16px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:13px;line-height:1.5;color:#64748b;text-align:center">
      Si necesitas agregar algo más, responde este correo o escríbenos desde el formulario de contacto.
    </p>`;

  const text = [
    `Hola ${firstName},`,
    "",
    "Recibimos tu consulta en Telvoice. Nuestro equipo la revisará y te contactaremos pronto.",
    "",
    "Tu mensaje:",
    data.message,
    "",
    siteUrl,
  ].join("\n");

  return { subject, html: emailShell("Consulta recibida", body), text };
}
