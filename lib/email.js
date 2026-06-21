import { formatClp } from "./format-clp.js";
import { toPublicOrderSummary } from "./order-summary.js";

function siteUrl() {
  const base = (process.env.PUBLIC_SITE_URL || "https://www.telvoice.cl").replace(
    /\/$/,
    ""
  );
  return base;
}

function emailFrom() {
  return (
    process.env.ORDER_EMAIL_FROM || "Telvoice <ventas@telvoice.net>"
  );
}

function notifyEmails() {
  const raw =
    process.env.ORDER_NOTIFY_EMAIL || "billing@telvoice.net";
  return raw
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

function contactLeadNotifyEmails() {
  const raw =
    process.env.ORDER_NOTIFY_EMAIL?.trim() ||
    process.env.BILLING_NOTIFY_EMAIL?.trim() ||
    "victor@telvoice.net";
  return [
    ...new Set(
      raw
        .split(/[,;]/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  ];
}

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY no configurado; omitiendo envío a", to);
    return { ok: false, skipped: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[email] Resend error", res.status, data);
    return { ok: false, error: data?.message || "send_failed" };
  }
  return { ok: true, id: data.id };
}

function detailRows(summary) {
  const o = summary;
  return [
    ["Producto", o.plan_name],
    ["Cantidad SMS", o.formatted.sms ? `${o.formatted.sms} mensajes` : "—"],
    ["Neto", o.formatted.net],
    ["IVA (19%)", o.formatted.tax],
    ["Total pagado", o.formatted.total],
    ["N.º orden Telvoice", o.order_id],
    o.mercadopago.payment_id
      ? ["N.º pago Mercado Pago", o.mercadopago.payment_id]
      : null,
  ].filter(Boolean);
}

function rowsHtml(rows) {
  return rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px 8px 0;color:#5c6478;font-size:14px;vertical-align:top;">${label}</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#131b2e;">${value}</td></tr>`
    )
    .join("");
}

function rowsText(rows) {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function wrapHtml(title, bodyHtml) {
  const base = siteUrl();
  const replyTo =
    process.env.ORDER_EMAIL_REPLY_TO ||
    process.env.EMAIL_REPLY_TO ||
    "soporte@telvoice.cl";
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
                    <img src="${base}/assets/telvoice-isotipo.png" width="40" height="40" alt="telvoice" style="display:block;border:0;outline:none;text-decoration:none" />
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
            <td align="center" style="padding:32px 28px 28px">${bodyHtml}</td>
          </tr>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center">
              Este correo fue enviado por Telvoice. Si no realizaste esta solicitud, contacta a
              <a href="mailto:${escapeHtml(replyTo)}" style="color:#0052cc;text-decoration:none">${escapeHtml(replyTo)}</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function summaryCard(rowsHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:420px;margin:0 auto 24px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
    <tr>
      <td align="center" style="padding:18px 20px;font-family:Segoe UI,system-ui,sans-serif;font-size:13px;line-height:1.7;color:#334155;text-align:center">${rowsHtml}</td>
    </tr>
  </table>`;
}

function ctaButton(href, label) {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0;">
    <tr>
      <td align="center" bgcolor="#0052cc" style="background-color:#0052cc;border-radius:8px;">
        <a href="${safeHref}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;white-space:nowrap">${safeLabel}</a>
      </td>
    </tr>
  </table>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendLeadNotificationEmail(lead) {
  const summaryRows = [
    `<div><strong>Nombre o empresa:</strong> ${escapeHtml(lead.name || "—")}</div>`,
    `<div><strong>Correo:</strong> ${escapeHtml(lead.email || "—")}</div>`,
    `<div><strong>Teléfono:</strong> ${escapeHtml(lead.phone || "—")}</div>`,
    `<div><strong>Origen:</strong> Formulario contacto — telvoice.cl</div>`,
    lead.pageUrl
      ? `<div><strong>Página:</strong> ${escapeHtml(lead.pageUrl)}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const messageHtml = escapeHtml(lead.message || "—").replace(/\n/g, "<br />");
  const replyUrl = lead.email
    ? `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent("Re: tu consulta en Telvoice")}`
    : siteUrl();

  const bodyHtml = `
    <p style="margin:0 0 16px;text-align:center">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.02em">Formulario contacto</span>
    </p>
    <p style="margin:0 0 12px;font-family:Segoe UI,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.35;color:#0f172a;text-align:center">
      Nueva consulta desde telvoice.cl
    </p>
    <p style="margin:0 0 24px;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#334155;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">
      ${escapeHtml(lead.name || "Un visitante")} envió una solicitud desde el formulario de contacto del landing.
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

  const html = wrapHtml("Consulta landing", bodyHtml);

  const text = [
    `[Telvoice] Consulta landing — ${lead.name || "Sin nombre"}`,
    "",
    "Nueva consulta desde telvoice.cl",
    "",
    `Nombre o empresa: ${lead.name || "—"}`,
    `Correo: ${lead.email || "—"}`,
    `Teléfono: ${lead.phone || "—"}`,
    "Origen: Formulario contacto — telvoice.cl",
    lead.pageUrl ? `Página: ${lead.pageUrl}` : null,
    "",
    "Mensaje:",
    lead.message || "—",
  ]
    .filter(Boolean)
    .join("\n");

  const results = [];
  for (const to of contactLeadNotifyEmails()) {
    results.push(
      await sendViaResend({
        to,
        subject: `[Telvoice] Consulta landing — ${lead.name || "Sin nombre"}`,
        html,
        text,
      }),
    );
  }

  const anyOk = results.some((r) => r.ok);
  const allSkipped = results.length > 0 && results.every((r) => r.skipped);
  return { ok: anyOk, skipped: allSkipped, results };
}

export async function sendLeadClientConfirmationEmail(lead) {
  const email = String(lead.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, skipped: true, reason: "no_email" };
  }

  const firstName = String(lead.name || "Cliente").trim().split(/\s+/)[0] || "Cliente";
  const landingUrl = siteUrl().replace(/\/$/, "");
  const messageHtml = escapeHtml(lead.message || "—").replace(/\n/g, "<br />");

  const bodyHtml = `
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
    ${ctaButton(landingUrl, "Visitar telvoice.cl")}
    <p style="margin:16px 0 0;font-family:Segoe UI,system-ui,sans-serif;font-size:13px;line-height:1.5;color:#64748b;text-align:center">
      Si necesitas agregar algo más, responde este correo o escríbenos desde el formulario de contacto.
    </p>`;

  const html = wrapHtml("Consulta recibida", bodyHtml);
  const text = [
    `Hola ${firstName},`,
    "",
    "Recibimos tu consulta en Telvoice. Nuestro equipo la revisará y te contactaremos pronto.",
    "",
    "Tu mensaje:",
    lead.message || "—",
    "",
    landingUrl,
  ].join("\n");

  return sendViaResend({
    to: email,
    subject: "Recibimos tu consulta — Telvoice",
    html,
    text,
  });
}

export async function sendCustomerOrderEmail(order) {
  const summary = toPublicOrderSummary(order);
  const email = order.customer?.email;
  if (!email) return { ok: false, skipped: true, reason: "no_email" };

  const rows = detailRows(summary);
  const firstName = (order.customer?.name || "Cliente").split(/\s+/)[0];
  const isSim = order.product_type === "sim_subscription";

  const intro = isSim
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#43474e;">Hola ${firstName}, recibimos el pago de tu plan de numeración SIM. Estos son los detalles:</p>`
    : `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#43474e;">Hola ${firstName}, recibimos tu pago. Estos son los detalles de tu bolsa SMS:</p>`;

  const footer = isSim
    ? `<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#43474e;">Activaremos tu número SIM y la cuota mensual de SMS en las próximas horas hábiles. Te escribiremos a este correo con los datos de acceso y configuración.</p>`
    : `<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#43474e;">Activaremos tu bolsa en las próximas horas hábiles y te escribiremos a este correo cuando esté lista para enviar mensajes.</p>`;

  const html = wrapHtml(
    isSim ? "Tu plan SIM Telvoice fue confirmado" : "Tu compra en Telvoice.cl fue confirmada",
    `${intro}
     <table cellpadding="0" cellspacing="0">${rowsHtml(rows)}</table>
     ${footer}
     <p style="margin:12px 0 0;font-size:14px;color:#43474e;">¿Dudas? Responde a este correo o escríbenos por WhatsApp desde <a href="${siteUrl()}/#contacto" style="color:#0052cc;">telvoice.cl</a>.</p>`
  );

  const textBody = isSim
    ? "Activaremos tu número SIM y la cuota mensual de SMS en las próximas horas hábiles."
    : "Activaremos tu bolsa en las próximas horas hábiles.";

  const text = `Hola ${firstName},

Tu pago en Telvoice.cl fue confirmado.

${rowsText(rows)}

${textBody}

${siteUrl()}`;

  return sendViaResend({
    to: email,
    subject: isSim
      ? `Plan SIM confirmado — ${summary.plan_name}`
      : `Compra confirmada — ${summary.plan_name} (${summary.formatted.sms} SMS)`,
    html,
    text,
  });
}

export async function sendSellerOrderEmail(order) {
  const summary = toPublicOrderSummary(order);
  const customer = order.customer || {};
  const isSim = order.product_type === "sim_subscription";
  const rows = [
    ...detailRows(summary),
    ["Tipo", isSim ? "Suscripción SIM mensual" : "Bolsa SMS"],
    ["Cliente", customer.name || "—"],
    ["Correo", customer.email || "—"],
    ["Teléfono", customer.phone || "—"],
    ["RUT", customer.rut || "—"],
    ["Empresa", customer.business_name || "—"],
    ["Estado orden", summary.status],
  ];

  const html = wrapHtml(
    "Nueva venta en Telvoice.cl",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#43474e;">Se aprobó un pago con Mercado Pago. Resumen para activación:</p>
     <table cellpadding="0" cellspacing="0">${rowsHtml(rows)}</table>
     <p style="margin:20px 0 0;font-size:14px;color:#43474e;">Total acreditado en MP (menos comisión): revisar panel de Mercado Pago.</p>`
  );

  const text = `Nueva venta Telvoice.cl\n\n${rowsText(rows)}`;

  const results = [];
  for (const to of notifyEmails()) {
    results.push(
      await sendViaResend({
        to,
        subject: `[Telvoice] Venta ${summary.plan_name} — ${formatClp(summary.total_amount)}`,
        html,
        text,
      })
    );
  }
  const anyOk = results.some((r) => r.ok);
  return { ok: anyOk, results };
}

export async function sendOrderConfirmationEmails(order) {
  if (order.confirmation_emails_sent_at) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  const customer = await sendCustomerOrderEmail(order);
  const seller = await sendSellerOrderEmail(order);

  const sent =
    customer.ok || seller.ok || customer.skipped || seller.skipped;

  return {
    ok: sent,
    customer,
    seller,
    shouldMarkSent: customer.ok || seller.ok,
  };
}
