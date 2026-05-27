import type { AdminSessionUser } from "../../../types/admin.js";
import type { EmailLogRow } from "../../../types/email.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { formatOrderShortId } from "../../../utils/order-display.js";
import { wrapAdminPage } from "../admin-page-wrap.js";

export function renderAdminEmailLogsPage(opts: {
  admin: AdminSessionUser;
  logs: EmailLogRow[];
  filterStatus?: string;
  filterTemplate?: string;
  flash?: { ok?: string; error?: string };
}): string {
  const rows = opts.logs.length
    ? opts.logs
        .map((log) => {
          const orderCell = log.order_id
            ? `<a href="/admin/orders/${escapeHtml(log.order_id)}"><code>${escapeHtml(formatOrderShortId(log.order_id))}</code></a>`
            : "—";
          const invoiceCell = log.invoice_id
            ? `<a href="/admin/invoices/${escapeHtml(log.invoice_id)}">Ver</a>`
            : "—";
          const resend =
            log.status === "failed" || log.status === "sent"
              ? `<form method="post" action="/admin/email-logs/${escapeHtml(log.id)}/resend" style="display:inline">
                   <button type="submit" class="btn btn-ghost btn-sm">Reenviar</button>
                 </form>`
              : "";
          return `<tr>
            <td>${formatDate(log.created_at)}</td>
            <td>${escapeHtml(log.recipient_email)}</td>
            <td><code>${escapeHtml(log.template_key)}</code></td>
            <td>${orderCell}</td>
            <td>${invoiceCell}</td>
            <td><span class="badge badge-${log.status === "sent" ? "ok" : log.status === "failed" ? "err" : "muted"}">${escapeHtml(log.status)}</span></td>
            <td>${escapeHtml(log.provider)}</td>
            <td class="text-danger" style="max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(log.error_message ?? "")}">${escapeHtml(log.error_message ?? "—")}</td>
            <td>${resend}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="9" class="tv-table-empty">Sin registros de email.</td></tr>`;

  const flashOk = opts.flash?.ok
    ? `<div class="alert alert-success">${escapeHtml(opts.flash.ok)}</div>`
    : "";
  const flashErr = opts.flash?.error
    ? `<div class="alert alert-danger">${escapeHtml(opts.flash.error)}</div>`
    : "";

  const body = `
    ${flashOk}
    ${flashErr}
    <section class="tv-panel">
      <div class="tv-panel__head">
        <h1 class="tv-panel__title">Emails transaccionales</h1>
        <p class="field-hint">Modo mock: no se envía correo real; solo auditoría en email_logs.</p>
      </div>
      <div class="tv-panel__body">
        <form method="get" class="tv-filter-bar" style="margin-bottom:1rem">
          <label>Estado
            <select name="status">
              <option value="">Todos</option>
              <option value="sent"${opts.filterStatus === "sent" ? " selected" : ""}>sent</option>
              <option value="failed"${opts.filterStatus === "failed" ? " selected" : ""}>failed</option>
              <option value="pending"${opts.filterStatus === "pending" ? " selected" : ""}>pending</option>
              <option value="skipped"${opts.filterStatus === "skipped" ? " selected" : ""}>skipped</option>
            </select>
          </label>
          <label>Template
            <input type="text" name="template" value="${escapeHtml(opts.filterTemplate ?? "")}" placeholder="payment_received_pending_claim" />
          </label>
          <button type="submit" class="btn btn-secondary btn-sm">Filtrar</button>
        </form>
        <div class="tv-table-wrap">
          <table class="tv-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Destinatario</th><th>Template</th><th>Orden</th><th>Invoice</th>
                <th>Estado</th><th>Provider</th><th>Error</th><th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </section>`;

  return wrapAdminPage({
    admin: opts.admin,
    title: "Emails transaccionales",
    body,
    activeNav: "email-logs",
  });
}

export function renderOrderEmailsPanel(
  logs: EmailLogRow[],
  order: {
    id: string;
    credit_status: string;
    payment_status: string;
  },
  invoiceId: string | null,
): string {
  const rows = logs.length
    ? logs
        .map(
          (log) =>
            `<tr>
              <td>${formatDate(log.created_at)}</td>
              <td><code>${escapeHtml(log.template_key)}</code></td>
              <td>${escapeHtml(log.status)}</td>
              <td>${escapeHtml(log.error_message ?? "—")}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="tv-table-empty">Sin emails registrados para esta orden.</td></tr>`;

  const resendClaim =
    order.payment_status === "paid" && order.credit_status === "pending_claim"
      ? `<form method="post" action="/admin/orders/${escapeHtml(order.id)}/resend-claim-email" style="display:inline;margin-right:0.5rem">
           <button type="submit" class="btn btn-secondary btn-sm">Reenviar activación</button>
         </form>`
      : "";

  const resendInvoice = invoiceId
    ? `<form method="post" action="/admin/orders/${escapeHtml(order.id)}/resend-invoice-email" style="display:inline">
         <button type="submit" class="btn btn-secondary btn-sm">Reenviar comprobante</button>
       </form>`
    : "";

  return `<section class="tv-panel tv-panel--hint" style="margin-top:1rem">
    <h2 class="tv-panel__title">Emails</h2>
    <div class="tv-panel__body">
      <div class="tv-quick-actions" style="margin-bottom:0.75rem">${resendClaim}${resendInvoice}</div>
      <div class="tv-table-wrap">
        <table class="tv-table tv-table--compact">
          <thead><tr><th>Fecha</th><th>Template</th><th>Estado</th><th>Error</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}
