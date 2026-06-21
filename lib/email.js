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
    process.env.CONTACT_LEAD_NOTIFY_EMAIL?.trim() ||
    process.env.ORDER_NOTIFY_EMAIL?.trim() ||
    process.env.BILLING_NOTIFY_EMAIL?.trim() ||
    "billing@telvoice.net";
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
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #e2e6f0;">
        <tr><td style="padding:24px 28px 8px;">
          <img src="${base}/assets/telvoice-isotipo.png" alt="Telvoice.cl" width="40" height="40" style="display:block;" />
        </td></tr>
        <tr><td style="padding:8px 28px 24px;">
          <h1 style="margin:0 0 12px;font-family:Montserrat,Arial,sans-serif;font-size:22px;color:#131b2e;">${title}</h1>
          ${bodyHtml}
          <p style="margin:24px 0 0;font-size:13px;color:#5c6478;line-height:1.5;">
            <a href="${base}" style="color:#0052cc;">telvoice.cl</a> · SMS masivos para empresas en Chile
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendLeadNotificationEmail(lead) {
  const rows = [
    ["Nombre o empresa", lead.name || "—"],
    ["Correo", lead.email || "—"],
    ["Teléfono", lead.phone || "—"],
    ["Origen", "Formulario contacto — telvoice.cl"],
    lead.pageUrl ? ["Página", lead.pageUrl] : null,
  ].filter(Boolean);

  const messageBlock = lead.message
    ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#43474e;white-space:pre-wrap;">${escapeHtml(
        lead.message,
      )}</p>`
    : `<p style="margin:0;font-size:14px;color:#5c6478;">Sin mensaje adicional.</p>`;

  const html = wrapHtml(
    "Nueva consulta desde telvoice.cl",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#43474e;">Se recibió una solicitud desde el formulario de contacto del landing.</p>
     <table cellpadding="0" cellspacing="0">${rowsHtml(rows)}</table>
     <p style="margin:20px 0 8px;font-size:14px;font-weight:600;color:#131b2e;">Mensaje</p>
     ${messageBlock}`,
  );

  const text = `Nueva consulta Telvoice.cl\n\n${rowsText(rows)}\n\nMensaje:\n${
    lead.message || "—"
  }`;

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
