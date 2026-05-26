import type { AdminInvoicePageOpts } from "./admin-invoices-pages.js";
import type {
  BillingRecoverySummary,
  FailedBillingEmailRow,
  FailedBillingSyncRow,
  InvoiceWithoutEmailRow,
  OrderWithoutInvoiceRow,
} from "../../../types/billing.js";
import { formatOrderShortId, paymentMethodLabel } from "../../../utils/order-display.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

export type AdminBillingRecoveryContext = {
  summary: BillingRecoverySummary;
  ordersWithout: OrderWithoutInvoiceRow[];
  invoicesWithout: InvoiceWithoutEmailRow[];
  failedEmails: FailedBillingEmailRow[];
  failedSyncs: FailedBillingSyncRow[];
};

function fmtMoney(amount: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function docNum(inv: { invoice_number: string | null; invoice_id: string }): string {
  return inv.invoice_number?.trim() || inv.invoice_id.slice(0, 8);
}

function renderRecoveryKpis(summary: BillingRecoverySummary): string {
  return `<div class="tv-kpi-grid">
    ${renderKpiCard({
      label: "Sin comprobante",
      value: String(summary.ordersWithoutInvoice),
      icon: "shopping_cart",
      variant: summary.ordersWithoutInvoice > 0 ? "warn" : "success",
    })}
    ${renderKpiCard({
      label: "Sin email mock",
      value: String(summary.invoicesWithoutEmail),
      icon: "mail",
      variant: summary.invoicesWithoutEmail > 0 ? "warn" : "default",
    })}
    ${renderKpiCard({
      label: "Emails fallidos",
      value: String(summary.failedEmailsUnreviewed),
      hint: `${summary.failedEmails} total`,
      icon: "error",
      variant: summary.failedEmailsUnreviewed > 0 ? "danger" : "default",
    })}
    ${renderKpiCard({
      label: "Sync fallidos",
      value: String(summary.failedSyncs),
      icon: "sync_problem",
      variant: summary.failedSyncs > 0 ? "danger" : "default",
    })}
    ${renderKpiCard({
      label: "Docs pendientes",
      value: String(summary.pendingDocuments),
      icon: "pending",
      variant: "default",
    })}
    ${renderKpiCard({
      label: "Última recuperación",
      value: summary.lastRecoveryAt ? formatDate(summary.lastRecoveryAt) : "—",
      icon: "history",
      variant: "default",
    })}
  </div>`;
}

function renderOrdersWithoutTable(rows: OrderWithoutInvoiceRow[]): string {
  if (!rows.length) {
    return `<p class="field-hint" style="margin:0">No hay órdenes pagadas y acreditadas sin comprobante.</p>`;
  }
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(formatDate(r.created_at))}</td>
        <td>${escapeHtml(r.company_name)}</td>
        <td><a href="/admin/orders/${escapeHtml(r.order_id)}"><code>${escapeHtml(formatOrderShortId(r.order_id))}</code></a></td>
        <td>${escapeHtml(paymentMethodLabel(r.payment_provider))}</td>
        <td>${fmtMoney(r.amount, r.currency)}</td>
        <td>${escapeHtml(r.payment_status)}</td>
        <td>${escapeHtml(r.credit_status)}</td>
        <td>
          <form method="post" action="/admin/billing/recovery/orders/${escapeHtml(r.order_id)}/sync" style="display:inline">
            <button type="submit" class="btn btn-primary btn-sm">Generar comprobante</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap" style="padding:0;overflow-x:auto">
    <table class="tv-table">
      <thead><tr>
        <th>Fecha</th><th>Cliente</th><th>Orden</th><th>Pago</th><th>Monto</th>
        <th>Estado pago</th><th>Crédito</th><th>Acción</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderInvoicesWithoutEmailTable(rows: InvoiceWithoutEmailRow[]): string {
  if (!rows.length) {
    return `<p class="field-hint" style="margin:0">Todos los comprobantes tienen al menos un email mock enviado.</p>`;
  }
  const body = rows
    .map((r) => {
      const email = r.billing_email ?? r.customer_email ?? "—";
      return `<tr>
        <td><a href="/admin/invoices/${escapeHtml(r.invoice_id)}"><strong>${escapeHtml(docNum({ invoice_number: r.invoice_number, invoice_id: r.invoice_id }))}</strong></a></td>
        <td>${escapeHtml(r.company_name)}</td>
        <td><a href="/admin/orders/${escapeHtml(r.order_id)}"><code>${escapeHtml(formatOrderShortId(r.order_id))}</code></a></td>
        <td>${escapeHtml(r.status)}</td>
        <td>${escapeHtml(email)}</td>
        <td>
          <form method="post" action="/admin/billing/recovery/invoices/${escapeHtml(r.invoice_id)}/send-email" style="display:inline">
            <button type="submit" class="btn btn-secondary btn-sm">Enviar email mock</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap" style="padding:0;overflow-x:auto">
    <table class="tv-table">
      <thead><tr>
        <th>Documento</th><th>Cliente</th><th>Orden</th><th>Estado</th><th>Email facturación</th><th>Acción</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderFailedEmailsTable(rows: FailedBillingEmailRow[]): string {
  if (!rows.length) {
    return `<p class="field-hint" style="margin:0">No hay emails fallidos pendientes.</p>`;
  }
  const body = rows
    .map((r) => {
      const reviewedBadge = r.reviewed
        ? `<span class="badge badge-muted">Revisado</span>`
        : "";
      return `<tr>
        <td><a href="/admin/invoices/${escapeHtml(r.invoice_id)}">${escapeHtml(docNum({ invoice_number: r.invoice_number, invoice_id: r.invoice_id }))}</a></td>
        <td>${escapeHtml(r.company_name)}</td>
        <td>${escapeHtml(r.to_email)}</td>
        <td class="text-danger" title="${escapeHtml(r.error_message ?? "")}">${escapeHtml((r.error_message ?? "—").slice(0, 80))}</td>
        <td>${escapeHtml(formatDate(r.created_at))}</td>
        <td>${reviewedBadge}</td>
        <td style="white-space:nowrap">
          <form method="post" action="/admin/billing/recovery/emails/${escapeHtml(r.email_log_id)}/retry" style="display:inline">
            <button type="submit" class="btn btn-secondary btn-sm">Reintentar</button>
          </form>
          ${
            !r.reviewed
              ? `<form method="post" action="/admin/billing/recovery/emails/${escapeHtml(r.email_log_id)}/mark-reviewed" style="display:inline;margin-left:0.25rem">
            <button type="submit" class="btn btn-ghost btn-sm">Marcar revisado</button>
          </form>`
              : ""
          }
        </td>
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap" style="padding:0;overflow-x:auto">
    <table class="tv-table">
      <thead><tr>
        <th>Documento</th><th>Cliente</th><th>Destinatario</th><th>Error</th><th>Fecha</th><th></th><th>Acciones</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderFailedSyncTable(rows: FailedBillingSyncRow[]): string {
  if (!rows.length) {
    return `<p class="field-hint" style="margin:0">No hay eventos billing.sync.failed recientes.</p>`;
  }
  const body = rows
    .map((r) => {
      const orderAction = r.order_id
        ? `<form method="post" action="/admin/billing/recovery/orders/${escapeHtml(r.order_id)}/sync" style="display:inline">
             <button type="submit" class="btn btn-secondary btn-sm">Reintentar sync</button>
           </form>`
        : `<span class="field-hint">—</span>`;
      return `<tr>
        <td><a href="/admin/invoices/${escapeHtml(r.invoice_id)}">${escapeHtml(r.invoice_number ?? r.invoice_id.slice(0, 8))}</a></td>
        <td>${r.order_id ? `<a href="/admin/orders/${escapeHtml(r.order_id)}"><code>${escapeHtml(formatOrderShortId(r.order_id))}</code></a>` : "—"}</td>
        <td>${escapeHtml(r.company_name)}</td>
        <td>${escapeHtml((r.error_message ?? "—").slice(0, 100))}</td>
        <td>${escapeHtml(formatDate(r.created_at))}</td>
        <td>${orderAction}</td>
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap" style="padding:0;overflow-x:auto">
    <table class="tv-table">
      <thead><tr>
        <th>Documento</th><th>Orden</th><th>Cliente</th><th>Error</th><th>Fecha</th><th>Acción</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

export function renderAdminBillingRecoveryPage(
  opts: AdminInvoicePageOpts,
  ctx: AdminBillingRecoveryContext,
): string {
  const alert = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : opts.flash
      ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>`
      : "";

  const issueBanner = ctx.summary.hasIssues
    ? `<div class="alert alert-warn" role="status">Hay incidencias Billing pendientes de revisión. Las acciones son idempotentes y usan modo mock (sin email real).</div>`
    : `<div class="alert alert-success" role="status">Sin incidencias críticas detectadas en el monitoreo actual.</div>`;

  const body = `
    ${renderSuperadminBanner()}
    ${alert}
    ${renderPageHeader({
      title: "Recuperación Billing",
      subtitle:
        "Detecta órdenes sin comprobante, emails mock pendientes o fallidos, y reintenta de forma controlada.",
      actions: `
        ${renderBtn("Volver a facturación", { href: "/admin/invoices", variant: "secondary" })}
        <a href="/admin/orders" class="btn btn-ghost btn-sm">Ver compras</a>
      `,
    })}
    ${issueBanner}
    <section class="tv-panel tv-panel--hint" style="margin-bottom:1rem">
      <div class="tv-panel__body">
        <strong>Modo email: ${escapeHtml(opts.billingEmailMode ?? "mock")}</strong> — No se envía correo real. No se modifica wallet ni pagos MercadoPago.
      </div>
    </section>
    ${renderRecoveryKpis(ctx.summary)}
    ${renderPanel("A. Órdenes pagadas/acreditadas sin comprobante", renderOrdersWithoutTable(ctx.ordersWithout))}
    ${renderPanel("B. Comprobantes sin email mock enviado", renderInvoicesWithoutEmailTable(ctx.invoicesWithout))}
    ${renderPanel("C. Emails fallidos", renderFailedEmailsTable(ctx.failedEmails))}
    ${renderPanel("D. Syncs fallidos (billing.sync.failed)", renderFailedSyncTable(ctx.failedSyncs))}
    ${renderAdminUiScript()}`;

  return wrapAdminPage({
    admin: opts.admin,
    title: "Recuperación Billing",
    activeNav: "invoices",
    body,
    topbar: {
      smsBalance: opts.smsBalance ?? "—",
      routesLabel: "Billing Recovery",
      routesOk: true,
      companyName: "telvoice · superadmin",
    },
  });
}

export function renderInvoiceRecoveryAlerts(
  hints: {
    hasFailedEmail: boolean;
    hasSuccessfulEmail: boolean;
    hasSyncFailed: boolean;
    latestFailedEmailLogId: string | null;
  },
  invoiceId: string,
): string {
  const parts: string[] = [];
  if (hints.hasSyncFailed) {
    parts.push(
      `<div class="alert alert-warn">Se detectó un <strong>billing.sync.failed</strong> en esta invoice. Revisa eventos o usa <a href="/admin/invoices/recovery">Recuperación Billing</a>.</div>`,
    );
  }
  if (hints.hasFailedEmail && hints.latestFailedEmailLogId) {
    parts.push(
      `<div class="alert alert-error">
        Último envío de email en estado <strong>failed</strong>.
        <form method="post" action="/admin/billing/recovery/emails/${escapeHtml(hints.latestFailedEmailLogId)}/retry" style="display:inline;margin-left:0.5rem">
          <button type="submit" class="btn btn-secondary btn-sm">Reintentar email mock</button>
        </form>
        <form method="post" action="/admin/billing/recovery/emails/${escapeHtml(hints.latestFailedEmailLogId)}/mark-reviewed" style="display:inline;margin-left:0.25rem">
          <button type="submit" class="btn btn-ghost btn-sm">Marcar revisado</button>
        </form>
      </div>`,
    );
  } else if (!hints.hasSuccessfulEmail) {
    parts.push(
      `<div class="alert alert-warn">
        Sin email mock enviado.
        <form method="post" action="/admin/billing/recovery/invoices/${escapeHtml(invoiceId)}/send-email" style="display:inline;margin-left:0.5rem">
          <button type="submit" class="btn btn-secondary btn-sm">Enviar email mock</button>
        </form>
      </div>`,
    );
  }
  return parts.join("");
}
