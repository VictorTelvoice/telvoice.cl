import type { AdminSessionUser } from "../../../types/admin.js";
import type { CompanyRow } from "../../../types/tenant.js";
import type {
  AdminInvoiceDetail,
  AdminInvoiceListRow,
  AdminInvoiceSummary,
  BillingDocumentType,
  BillingEmailLog,
  BillingEvent,
  BillingInvoiceItem,
  BillingInvoiceStatus,
} from "../../../types/billing.js";
import type { SmsOrderRow } from "../../../types/wallet.js";
import {
  formatOrderShortId,
  paymentMethodLabel,
} from "../../../utils/order-display.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderFilterField,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

export type AdminInvoicePageOpts = {
  admin: AdminSessionUser;
  smsBalance?: string;
  flash?: string;
  error?: string;
  billingEmailMode?: string;
  recoveryIssueCount?: number;
};

export type AdminInvoicePageFilters = {
  search?: string;
  status?: BillingInvoiceStatus;
  documentType?: BillingDocumentType;
  companyId?: string;
  fromDate?: string;
  toDate?: string;
  paymentProvider?: string;
  minAmount?: number;
  maxAmount?: number;
  errorsOnly?: boolean;
};

export type AdminInvoiceListContext = {
  invoices: AdminInvoiceListRow[];
  filters: AdminInvoicePageFilters;
  summary: AdminInvoiceSummary;
  companies: CompanyRow[];
  orderById: Map<string, SmsOrderRow>;
};

function wrap(
  opts: AdminInvoicePageOpts,
  title: string,
  body: string,
): string {
  const alert = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : opts.flash
      ? `<div class="alert alert-success">${escapeHtml(opts.flash)}</div>`
      : "";
  return wrapAdminPage({
    admin: opts.admin,
    title,
    activeNav: "invoices",
    body: alert + body,
    topbar: {
      smsBalance: opts.smsBalance ?? "—",
      routesLabel: "Billing",
      routesOk: true,
      companyName: "telvoice · superadmin",
    },
  });
}

function fmtMoney(amount: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function pickQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = query[key];
  return typeof v === "string" ? v.trim() : "";
}

const INVOICE_STATUSES: readonly BillingInvoiceStatus[] = [
  "draft",
  "pending_issue",
  "issued",
  "sent",
  "paid",
  "cancelled",
  "failed",
  "voided",
];

const DOCUMENT_TYPES: readonly BillingDocumentType[] = [
  "purchase_receipt",
  "invoice",
  "tax_invoice",
  "credit_note",
  "manual_receipt",
];

export function parseAdminInvoiceFilters(
  query: Record<string, string | string[] | undefined>,
): AdminInvoicePageFilters {
  const statusRaw = pickQuery(query, "status");
  const docRaw = pickQuery(query, "document_type");
  const status = INVOICE_STATUSES.includes(statusRaw as BillingInvoiceStatus)
    ? (statusRaw as BillingInvoiceStatus)
    : undefined;
  const documentType = DOCUMENT_TYPES.includes(docRaw as BillingDocumentType)
    ? (docRaw as BillingDocumentType)
    : undefined;

  const fromDate = pickQuery(query, "from_date");
  const toDate = pickQuery(query, "to_date");
  const minRaw = pickQuery(query, "min_amount");
  const maxRaw = pickQuery(query, "max_amount");

  return {
    search: pickQuery(query, "q") || undefined,
    status: pickQuery(query, "errors") === "1" ? "failed" : status,
    documentType,
    companyId: pickQuery(query, "company_id") || undefined,
    fromDate: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
    toDate: toDate ? `${toDate}T23:59:59.999Z` : undefined,
    paymentProvider: pickQuery(query, "payment_provider") || undefined,
    minAmount: minRaw && Number.isFinite(Number(minRaw)) ? Number(minRaw) : undefined,
    maxAmount: maxRaw && Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : undefined,
    errorsOnly: pickQuery(query, "errors") === "1",
  };
}

export function filterAdminInvoicesForDisplay(
  invoices: AdminInvoiceListRow[],
  filters: AdminInvoicePageFilters,
  orderById: Map<string, SmsOrderRow>,
): AdminInvoiceListRow[] {
  return invoices.filter((inv) => {
    const amt = Number(inv.total_amount);
    if (filters.minAmount != null && amt < filters.minAmount) {
      return false;
    }
    if (filters.maxAmount != null && amt > filters.maxAmount) {
      return false;
    }
    if (filters.paymentProvider) {
      const order = orderById.get(inv.order_id);
      const provider =
        order?.payment_provider ??
        (typeof inv.metadata?.order_payment_provider === "string"
          ? inv.metadata.order_payment_provider
          : null);
      if (provider !== filters.paymentProvider) {
        return false;
      }
    }
    return true;
  });
}

function shortDocId(id: string): string {
  return id.replaceAll("-", "").slice(0, 8).toUpperCase();
}

function documentNumber(inv: { id: string; invoice_number: string | null }): string {
  return inv.invoice_number?.trim() || `DOC-${shortDocId(inv.id)}`;
}

function documentTypeLabel(type: BillingDocumentType | string): string {
  const map: Record<string, string> = {
    purchase_receipt: "Comprobante de compra",
    invoice: "Factura",
    tax_invoice: "Factura tributaria",
    credit_note: "Nota de crédito",
    manual_receipt: "Recibo manual",
  };
  return map[type] ?? type;
}

function invoiceStatusBadge(status: BillingInvoiceStatus | string): string {
  const map: Record<string, [string, string]> = {
    draft: ["muted", "BORRADOR"],
    pending_issue: ["warn", "PENDIENTE"],
    issued: ["ok", "EMITIDO"],
    sent: ["ok", "ENVIADO"],
    paid: ["ok", "PAGADO"],
    cancelled: ["muted", "CANCELADO"],
    failed: ["err", "FALLIDO"],
    voided: ["muted", "ANULADO"],
  };
  const [cls, label] = map[status] ?? ["muted", String(status).toUpperCase()];
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

function emailStatusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    pending: ["warn", "NO ENVIADO"],
    sent: ["ok", "ENVIADO"],
    failed: ["err", "FALLÓ"],
    retrying: ["warn", "REINTENTO"],
  };
  const [cls, label] = map[status] ?? ["muted", status.toUpperCase()];
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

function deriveEmailColumn(
  inv: AdminInvoiceListRow,
): string {
  if (inv.status === "sent") {
    return emailStatusBadge("sent");
  }
  if (inv.status === "failed") {
    return emailStatusBadge("failed");
  }
  const email = inv.customer_email?.trim();
  if (email) {
    return `<span class="field-hint" title="Pendiente de envío">${escapeHtml(email)}</span>`;
  }
  return emailStatusBadge("pending");
}

function companyOptions(companies: CompanyRow[], selected?: string): string {
  const opts = companies
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${c.id === selected ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
    )
    .join("");
  return `<option value="">Todos los clientes</option>${opts}`;
}

function renderInfoNotice(): string {
  return `<section class="tv-panel tv-panel--hint" style="margin-bottom:0">
    <div class="tv-panel__body">
      <p style="margin:0;font-size:0.88rem;color:var(--tv-muted);line-height:1.5">
        <strong>Operación interna.</strong> Los documentos listados son comprobantes internos de compra (no tributarios).
        La facturación electrónica se habilitará con el proveedor correspondiente.
      </p>
    </div>
  </section>`;
}

function renderAdminInvoiceKpis(summary: AdminInvoiceSummary): string {
  return `<div class="tv-kpi-grid" style="margin-bottom:0">
    ${renderKpiCard({
      label: "Total documentado",
      value: fmtMoney(summary.totalAmount),
      hint: `${summary.count} documento(s)`,
      icon: "payments",
      variant: "primary",
    })}
    ${renderKpiCard({
      label: "Documentos emitidos",
      value: String(summary.issuedCount),
      hint: "Emitidos, enviados o pagados",
      icon: "receipt_long",
      variant: "success",
    })}
    ${renderKpiCard({
      label: "Pendientes",
      value: String(summary.pendingCount),
      icon: "pending",
      variant: "warn",
    })}
    ${renderKpiCard({
      label: "Enviados",
      value: String(summary.sentCount),
      icon: "mail",
      variant: "success",
    })}
    ${renderKpiCard({
      label: "Fallidos",
      value: String(summary.failedCount),
      icon: "error",
      variant: "danger",
    })}
    ${renderKpiCard({
      label: "Facturación del mes",
      value: fmtMoney(summary.monthAmount),
      hint: "Mes calendario actual",
      icon: "calendar_month",
      variant: "default",
    })}
    ${renderKpiCard({
      label: "Mercado Pago",
      value: fmtMoney(summary.mercadoPagoAmount),
      hint: "Documentado vía MP",
      icon: "credit_card",
      variant: "default",
    })}
    ${renderKpiCard({
      label: "Manual",
      value: fmtMoney(summary.manualAmount),
      hint: "Pago manual / checkout",
      icon: "point_of_sale",
      variant: "default",
    })}
  </div>`;
}

function renderFiltersPanel(
  filters: AdminInvoicePageFilters,
  companies: CompanyRow[],
): string {
  const statusOpts = [
    `<option value="">Todos</option>`,
    ...INVOICE_STATUSES.map((s) => {
      const labels: Record<string, string> = {
        draft: "Borrador",
        pending_issue: "Pendiente",
        issued: "Emitido",
        sent: "Enviado",
        paid: "Pagado",
        cancelled: "Cancelado",
        failed: "Fallido",
        voided: "Anulado",
      };
      const on = filters.status === s;
      return `<option value="${escapeHtml(s)}"${on ? " selected" : ""}>${escapeHtml(labels[s] ?? s)}</option>`;
    }),
  ].join("");

  const docOpts = [
    `<option value="">Todos</option>`,
    ...DOCUMENT_TYPES.map((d) => {
      const on = filters.documentType === d;
      return `<option value="${escapeHtml(d)}"${on ? " selected" : ""}>${escapeHtml(documentTypeLabel(d))}</option>`;
    }),
  ].join("");

  const payOpts = [
    `<option value="">Todos</option>`,
    ["mercadopago", "Mercado Pago"],
    ["manual", "Manual"],
    ["pending_checkout", "Manual (pendiente)"],
  ]
    .map(([v, label]) => {
      const on = filters.paymentProvider === v;
      return `<option value="${escapeHtml(v)}"${on ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  return `<section class="tv-panel tv-dlr-report__filters-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Filtros</h2>
      <p class="tv-section-head__sub">Búsqueda multi-cliente</p>
    </header>
    <div class="tv-panel__body">
      <form method="get" action="/admin/invoices" class="tv-form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:0.75rem 1rem;align-items:end">
        ${renderFilterField("Buscar", `<input type="text" name="q" class="tv-filter-input" placeholder="Nº documento, orden UUID" value="${escapeHtml(filters.search ?? "")}" />`)}
        ${renderFilterField("Cliente", `<select name="company_id" class="tv-filter-input">${companyOptions(companies, filters.companyId)}</select>`)}
        ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
        ${renderFilterField("Tipo", `<select name="document_type" class="tv-filter-input">${docOpts}</select>`)}
        ${renderFilterField("Método pago", `<select name="payment_provider" class="tv-filter-input">${payOpts}</select>`)}
        ${renderFilterField("Desde", `<input type="date" name="from_date" class="tv-filter-input" value="${escapeHtml(filters.fromDate?.slice(0, 10) ?? "")}" />`)}
        ${renderFilterField("Hasta", `<input type="date" name="to_date" class="tv-filter-input" value="${escapeHtml(filters.toDate?.slice(0, 10) ?? "")}" />`)}
        ${renderFilterField("Monto mín.", `<input type="number" name="min_amount" class="tv-filter-input" min="0" step="1" value="${filters.minAmount ?? ""}" placeholder="CLP" />`)}
        ${renderFilterField("Monto máx.", `<input type="number" name="max_amount" class="tv-filter-input" min="0" step="1" value="${filters.maxAmount ?? ""}" placeholder="CLP" />`)}
        <div style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:0.5rem">
          <button type="submit" class="btn btn-primary btn-sm">Aplicar filtros</button>
          <a class="btn btn-ghost btn-sm" href="/admin/invoices">Limpiar filtros</a>
          <a class="btn btn-ghost btn-sm" href="/admin/invoices?errors=1">Ver errores</a>
        </div>
      </form>
    </div>
  </section>`;
}

function renderEmptyState(): string {
  return `<section class="tv-panel">
    <div class="tv-panel__body tv-coming-soon" style="padding:2.5rem 1.5rem;text-align:center">
      <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>
      <h2 style="margin-top:1rem;font-size:1.1rem">No hay documentos de facturación</h2>
      <p class="field-hint" style="max-width:480px;margin:0.5rem auto 1.25rem">
        Cuando se generen comprobantes desde órdenes pagadas, aparecerán en esta sección.
      </p>
      <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap">
        <a href="/admin/orders" class="btn btn-primary btn-sm">Ver órdenes pagadas</a>
        <a href="/admin/wallets" class="btn btn-secondary btn-sm">Ir a wallets</a>
        <button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">Sincronizar órdenes</button>
      </div>
    </div>
  </section>`;
}

function renderInvoiceTable(
  invoices: AdminInvoiceListRow[],
  orderById: Map<string, SmsOrderRow>,
): string {
  if (!invoices.length) {
    return renderPanel(
      "Documentos",
      `<p class="field-hint" style="margin:0">No hay documentos con los filtros aplicados.</p>`,
    );
  }

  const rows = invoices
    .map((inv) => {
      const doc = documentNumber(inv);
      const company = inv.companies;
      const companyCell = company
        ? `<div><strong>${escapeHtml(company.name)}</strong>
           ${company.rut ? `<div class="field-hint">${escapeHtml(company.rut)}</div>` : ""}</div>`
        : `<span class="field-hint">${escapeHtml(shortDocId(inv.company_id))}</span>`;
      const order = orderById.get(inv.order_id);
      const provider =
        order?.payment_provider ??
        (typeof inv.metadata?.order_payment_provider === "string"
          ? inv.metadata.order_payment_provider
          : null);
      const orderHref = `/admin/orders/${escapeHtml(inv.order_id)}`;
      const detailHref = `/admin/invoices/${escapeHtml(inv.id)}`;

      return `<tr>
        <td>${escapeHtml(formatDate(inv.issued_at ?? inv.created_at))}</td>
        <td>${companyCell}</td>
        <td><strong>${escapeHtml(doc)}</strong></td>
        <td><a href="${orderHref}"><code>${escapeHtml(formatOrderShortId(inv.order_id))}</code></a></td>
        <td>${escapeHtml(documentTypeLabel(inv.document_type))}</td>
        <td>${escapeHtml(paymentMethodLabel(provider))}</td>
        <td>${fmtMoney(Number(inv.total_amount), inv.currency)}</td>
        <td>${invoiceStatusBadge(inv.status)}</td>
        <td>${deriveEmailColumn(inv)}</td>
        <td class="tv-table-actions" style="white-space:nowrap">
          <a href="${detailHref}" class="btn btn-ghost btn-sm">Detalle</a>
          <a href="${detailHref}/preview" class="btn btn-secondary btn-sm" target="_blank" rel="noopener">Comprobante</a>
          <a href="${orderHref}" class="btn btn-ghost btn-sm">Orden</a>
          <button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">Reenviar</button>
        </td>
      </tr>`;
    })
    .join("");

  return renderPanel(
    "Documentos de facturación",
    `<div class="table-wrap" style="padding:0;overflow-x:auto">
      <table class="tv-table">
        <thead><tr>
          <th>Fecha</th><th>Cliente</th><th>Documento</th><th>Orden</th><th>Tipo</th>
          <th>Método pago</th><th>Monto</th><th>Estado</th><th>Email</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="field-hint" style="margin:0.75rem 0 0">${invoices.length} registro(s)</p>`,
  );
}

export function renderAdminInvoicesPage(
  opts: AdminInvoicePageOpts,
  listCtx: AdminInvoiceListContext,
): string {
  const displayed = filterAdminInvoicesForDisplay(
    listCtx.invoices,
    listCtx.filters,
    listCtx.orderById,
  );

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Facturación",
      subtitle:
        "Gestiona comprobantes, documentos de compra, estados de envío y trazabilidad billing de todos los clientes.",
      actions: `
        <a href="/admin/invoices/recovery" class="btn btn-secondary btn-sm">
          Recuperación Billing
          ${
            (opts.recoveryIssueCount ?? 0) > 0
              ? `<span class="badge badge-warn" style="margin-left:0.35rem">${opts.recoveryIssueCount}</span>`
              : ""
          }
        </a>
        <button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">Exportar CSV</button>
        <a href="/admin/invoices?errors=1" class="btn btn-ghost btn-sm">Ver errores</a>
        <button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">Crear comprobante manual</button>
        <a href="/admin/orders" class="btn btn-ghost btn-sm">Ver compras →</a>
      `,
    })}
    ${renderInfoNotice()}
    ${renderAdminInvoiceKpis(listCtx.summary)}
    ${renderFiltersPanel(listCtx.filters, listCtx.companies)}
    ${
      listCtx.invoices.length === 0
        ? renderEmptyState()
        : renderInvoiceTable(displayed, listCtx.orderById)
    }
    ${renderAdminUiScript()}`;

  return wrap(opts, "Facturación", body);
}

function renderItemsTable(items: BillingInvoiceItem[]): string {
  if (!items.length) {
    return `<p class="field-hint" style="margin:0">Sin ítems.</p>`;
  }
  const rows = items
    .map(
      (it) => `<tr>
        <td>${escapeHtml(it.description)}</td>
        <td><code class="field-hint">${escapeHtml(it.package_id?.slice(0, 8) ?? "—")}</code></td>
        <td>${escapeHtml(String(it.quantity))}</td>
        <td>${fmtMoney(Number(it.unit_price))}</td>
        <td>${fmtMoney(Number(it.subtotal))}</td>
        <td>${fmtMoney(Number(it.tax_amount))}</td>
        <td><strong>${fmtMoney(Number(it.total))}</strong></td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap" style="padding:0"><table class="tv-table">
    <thead><tr>
      <th>Descripción</th><th>Bolsa</th><th>Cant.</th><th>P. unit.</th><th>Subtotal</th><th>IVA</th><th>Total</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderEventsList(events: BillingEvent[]): string {
  if (!events.length) {
    return `<p class="field-hint" style="margin:0">Sin eventos.</p>`;
  }
  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const rows = sorted
    .map(
      (e) => `<tr>
        <td>${escapeHtml(formatDate(e.created_at))}</td>
        <td><code>${escapeHtml(e.event_type)}</code></td>
        <td>${escapeHtml(e.description ?? "—")}</td>
        <td>${escapeHtml(e.actor_type ?? "—")}</td>
        <td class="field-hint">${escapeHtml(JSON.stringify(e.metadata ?? {}).slice(0, 120))}</td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap" style="padding:0"><table class="tv-table">
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Actor</th><th>Metadata</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderLatestEmailSummary(logs: BillingEmailLog[]): string {
  if (!logs.length) {
    return `<p class="field-hint" style="margin:0">Sin envíos registrados.</p>`;
  }
  const latest = [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]!;
  const mockTag =
    latest.metadata &&
    typeof latest.metadata === "object" &&
    (latest.metadata as Record<string, unknown>).mock === true
      ? ` · <span class="badge badge-warn">MOCK</span>`
      : "";
  return `<dl class="tv-meta-list" style="margin:0 0 1rem">
    <div><dt>Último estado</dt><dd>${emailStatusBadge(latest.status)}${mockTag}</dd></div>
    <div><dt>Destinatario</dt><dd>${escapeHtml(latest.to_email)}</dd></div>
    <div><dt>Proveedor</dt><dd><code>${escapeHtml(latest.provider ?? "—")}</code></dd></div>
    <div><dt>Enviado</dt><dd>${escapeHtml(latest.sent_at ? formatDate(latest.sent_at) : "—")}</dd></div>
    ${
      latest.error_message
        ? `<div><dt>Error</dt><dd class="text-danger">${escapeHtml(latest.error_message)}</dd></div>`
        : ""
    }
  </dl>`;
}

function renderBillingEmailModeNotice(mode?: string): string {
  if (mode !== "mock") {
    return "";
  }
  return `<section class="tv-panel tv-panel--hint" style="margin-bottom:1rem">
    <div class="tv-panel__body">
      <strong>Modo email: mock</strong> — Los envíos solo se registran en <code>billing_email_logs</code> y <code>billing_events</code>. No se envía correo real.
    </div>
  </section>`;
}

function renderEmailLogsTable(logs: BillingEmailLog[]): string {
  if (!logs.length) {
    return `<p class="field-hint" style="margin:0">No hay envíos registrados.</p>`;
  }
  const rows = [...logs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(
      (log) => `<tr>
        <td>${escapeHtml(log.to_email)}</td>
        <td>${escapeHtml(log.subject ?? "—")}</td>
        <td>${emailStatusBadge(log.status)}</td>
        <td>${escapeHtml(log.sent_at ? formatDate(log.sent_at) : "—")}</td>
        <td>${escapeHtml(log.provider ?? "—")}</td>
        <td title="${escapeHtml(log.error_message ?? "")}">${escapeHtml((log.error_message ?? "—").slice(0, 80))}</td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap" style="padding:0"><table class="tv-table">
    <thead><tr><th>Destinatario</th><th>Asunto</th><th>Estado</th><th>Enviado</th><th>Proveedor</th><th>Error</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function safeJsonPreview(value: unknown, max = 800): string {
  try {
    const raw = JSON.stringify(value ?? {}, null, 2);
    const trimmed = raw.length > max ? `${raw.slice(0, max)}…` : raw;
    return escapeHtml(trimmed);
  } catch {
    return "—";
  }
}

export function renderAdminInvoiceNotFoundPage(opts: AdminInvoicePageOpts): string {
  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Documento no encontrado",
      subtitle: "El comprobante no existe en el sistema.",
    })}
    <section class="tv-panel">
      <div class="tv-panel__body">
        ${renderBtn("Volver a facturación", { href: "/admin/invoices", variant: "primary" })}
      </div>
    </section>`;
  return wrap(opts, "Facturación", body);
}

export function renderAdminInvoiceDetailPage(
  opts: AdminInvoicePageOpts,
  detail: AdminInvoiceDetail,
  recoveryAlertsHtml = "",
): string {
  const doc = documentNumber(detail);
  const company = detail.company;
  const order = detail.order;

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: doc,
      subtitle: `${documentTypeLabel(detail.document_type)} · ${escapeHtml(company?.name ?? detail.customer_name ?? "—")}`,
      actions: `
        ${renderBtn("Volver", { href: "/admin/invoices", variant: "secondary" })}
        ${order ? renderBtn("Ver orden", { href: `/admin/orders/${order.id}`, variant: "ghost" }) : ""}
      `,
    })}
    ${renderInfoNotice()}
    ${renderBillingEmailModeNotice(opts.billingEmailMode)}
    ${recoveryAlertsHtml}

    <div class="tv-kpi-grid" style="margin-bottom:1rem">
      ${renderKpiCard({ label: "Total", value: fmtMoney(Number(detail.total_amount), detail.currency), icon: "payments", variant: "primary" })}
      ${renderKpiCard({ label: "Estado", value: detail.status.toUpperCase(), icon: "flag", variant: detail.status === "failed" ? "danger" : "success" })}
      ${renderKpiCard({ label: "Moneda", value: detail.currency, icon: "sell", variant: "default" })}
      ${renderKpiCard({ label: "Emisión", value: formatDate(detail.issued_at ?? detail.created_at), icon: "event", variant: "default" })}
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem">
      ${renderPanel(
        "Cliente",
        `<dl class="tv-meta-list">
          <div><dt>Empresa</dt><dd>${escapeHtml(company?.name ?? detail.customer_name ?? "—")}</dd></div>
          <div><dt>Razón social</dt><dd>${escapeHtml(company?.legal_name ?? detail.customer_legal_name ?? "—")}</dd></div>
          <div><dt>RUT</dt><dd>${escapeHtml(company?.rut ?? detail.customer_tax_id ?? "—")}</dd></div>
          <div><dt>Email facturación</dt><dd>${escapeHtml(company?.billing_email ?? detail.customer_email ?? "—")}</dd></div>
          <div><dt>Teléfono</dt><dd>${escapeHtml(company?.contact_phone ?? detail.customer_phone ?? "—")}</dd></div>
          <div><dt>País</dt><dd>${escapeHtml(company?.country ?? detail.customer_country ?? "CL")}</dd></div>
        </dl>`,
      )}
      ${renderPanel(
        "Orden asociada",
        order
          ? `<dl class="tv-meta-list">
          <div><dt>ID</dt><dd><a href="/admin/orders/${escapeHtml(order.id)}"><code>${escapeHtml(formatOrderShortId(order.id))}</code></a></dd></div>
          <div><dt>Referencia</dt><dd><code>${escapeHtml(order.payment_reference ?? "—")}</code></dd></div>
          <div><dt>Método pago</dt><dd>${escapeHtml(paymentMethodLabel(order.payment_provider))}</dd></div>
          <div><dt>Estado pago</dt><dd>${escapeHtml(order.payment_status)}</dd></div>
          <div><dt>Acreditación</dt><dd>${escapeHtml(order.credit_status)}</dd></div>
          <div><dt>Monto orden</dt><dd>${fmtMoney(Number(order.amount), order.currency)}</dd></div>
        </dl>`
          : `<p class="field-hint" style="margin:0">Orden no disponible.</p>`,
      )}
    </div>

    ${renderPanel("Ítems", renderItemsTable(detail.items))}
    ${renderPanel(
      "Correos (billing_email_logs)",
      `${renderLatestEmailSummary(detail.email_logs)}${renderEmailLogsTable(detail.email_logs)}`,
    )}
    ${renderPanel("Eventos billing", renderEventsList(detail.events))}

    ${renderPanel(
      "Proveedor tributario (futuro)",
      `<dl class="tv-meta-list">
        <div><dt>Provider</dt><dd>${escapeHtml(detail.provider ?? "—")}</dd></div>
        <div><dt>Document ID</dt><dd>${escapeHtml(detail.provider_document_id ?? "—")}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(detail.provider_status ?? "—")}</dd></div>
      </dl>
      <pre class="tv-code-block" style="margin-top:0.75rem;max-height:200px;overflow:auto;font-size:0.75rem">${safeJsonPreview(detail.provider_payload)}</pre>`,
    )}

    <section class="tv-panel tv-panel--hint" style="margin-top:1rem">
      <h2 class="tv-panel__title">Acciones operativas</h2>
      <div class="tv-panel__body tv-quick-actions">
        <a class="btn btn-primary btn-sm" href="/admin/invoices/${escapeHtml(detail.id)}/preview" target="_blank" rel="noopener">Ver comprobante</a>
        <form method="post" action="/admin/invoices/${escapeHtml(detail.id)}/send-email" style="display:inline">
          <button type="submit" class="btn btn-secondary btn-sm">Enviar comprobante</button>
        </form>
        <form method="post" action="/admin/invoices/${escapeHtml(detail.id)}/resend-email" style="display:inline">
          <button type="submit" class="btn btn-ghost btn-sm">Reenviar comprobante</button>
        </form>
        <button type="button" class="btn btn-secondary btn-sm" disabled title="Próximamente">Generar PDF</button>
        <button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">Regenerar documento</button>
        ${order ? renderBtn("Ver orden", { href: `/admin/orders/${order.id}`, variant: "ghost" }) : ""}
      </div>
      <p class="field-hint" style="margin:0.75rem 0 0">
        ${
          opts.billingEmailMode === "mock"
            ? "Envío en modo mock: se registra el log y el evento; no sale correo real. Si falta email de facturación, el intento queda en failed."
            : "Modo email: " + escapeHtml(opts.billingEmailMode ?? "—") + ". Proveedor real pendiente de integración."
        }
      </p>
    </section>
    ${renderAdminUiScript()}`;

  return wrap(opts, "Facturación", body);
}
