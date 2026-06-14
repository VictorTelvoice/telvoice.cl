import type {
  BillingDocumentType,
  BillingEmailLog,
  BillingEvent,
  BillingInvoice,
  BillingInvoiceItem,
  BillingInvoiceStatus,
  BillingInvoiceWithDetails,
} from "../../types/billing.js";
import type { SmsOrderRow } from "../../types/wallet.js";
import { paymentMethodLabel } from "../../utils/order-display.js";
import { escapeHtml, formatDate, formatDateShort } from "../../utils/html.js";
import { renderBtn, renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtMoney, wrapAppPage } from "./app-page-wrap.js";
import { renderOrderShortIdCell } from "./app-order-ui.js";

export type AppInvoicePageFilters = {
  search?: string;
  status?: BillingInvoiceStatus;
  documentType?: BillingDocumentType;
  fromDate?: string;
  toDate?: string;
  paymentProvider?: string;
};

export type AppInvoiceListContext = {
  invoices: BillingInvoice[];
  filters: AppInvoicePageFilters;
  summary: {
    totalAmount: number;
    count: number;
    issuedCount: number;
    sentCount: number;
    pendingCount: number;
    failedCount: number;
    lastDocumentAt: string | null;
  };
  orderById: Map<string, SmsOrderRow>;
};

function pickQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = query[key];
  if (typeof v === "string") {
    return v.trim();
  }
  return "";
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

export function parseAppInvoiceFilters(
  query: Record<string, string | string[] | undefined>,
): AppInvoicePageFilters {
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

  return {
    search: pickQuery(query, "q") || undefined,
    status,
    documentType,
    fromDate: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
    toDate: toDate ? `${toDate}T23:59:59.999Z` : undefined,
    paymentProvider: pickQuery(query, "payment_provider") || undefined,
  };
}

function shortDocId(id: string): string {
  return id.replaceAll("-", "").slice(0, 8).toUpperCase();
}

function documentNumber(inv: BillingInvoice): string {
  return inv.invoice_number?.trim() || `DOC-${shortDocId(inv.id)}`;
}

function orderPaymentProvider(
  inv: BillingInvoice,
  orderById: Map<string, SmsOrderRow>,
): string | null {
  const order = orderById.get(inv.order_id);
  if (order?.payment_provider) {
    return order.payment_provider;
  }
  const meta = inv.metadata ?? {};
  const fromMeta = meta.order_payment_provider;
  return typeof fromMeta === "string" ? fromMeta : null;
}

export function filterInvoicesForDisplay(
  invoices: BillingInvoice[],
  filters: AppInvoicePageFilters,
  orderById: Map<string, SmsOrderRow>,
): BillingInvoice[] {
  if (!filters.paymentProvider) {
    return invoices;
  }
  return invoices.filter((inv) => {
    const provider = orderPaymentProvider(inv, orderById);
    return provider === filters.paymentProvider;
  });
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

function renderInfoNotice(): string {
  return `<section class="tv-panel tv-panel--hint tv-invoice-notice">
    <div class="tv-panel__body">
      <h2 class="tv-panel__title" style="font-size:1rem;margin:0 0 0.35rem">Comprobantes internos de compra</h2>
      <p style="margin:0;color:var(--tv-muted);font-size:0.9rem;line-height:1.5">
        Los documentos disponibles en esta sección corresponden a comprobantes internos de compra.
        La facturación tributaria será habilitada cuando esté disponible la integración correspondiente.
      </p>
    </div>
  </section>`;
}

function renderFiltersPanel(filters: AppInvoicePageFilters): string {
  const statusOpts = [
    `<option value="">Todos</option>`,
    ...INVOICE_STATUSES.map((s) => {
      const label =
        {
          draft: "Borrador",
          pending_issue: "Pendiente emisión",
          issued: "Emitido",
          sent: "Enviado",
          paid: "Pagado",
          cancelled: "Cancelado",
          failed: "Fallido",
          voided: "Anulado",
        }[s] ?? s;
      const on = filters.status === s;
      return `<option value="${escapeHtml(s)}"${on ? " selected" : ""}>${escapeHtml(label)}</option>`;
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
    ["manual", "Pago manual"],
    ["pending_checkout", "Pago manual (pendiente)"],
  ]
    .map(([v, label]) => {
      const on = filters.paymentProvider === v;
      return `<option value="${escapeHtml(v)}"${on ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  const fromVal = filters.fromDate?.slice(0, 10) ?? "";
  const toVal = filters.toDate?.slice(0, 10) ?? "";

  return `<section class="tv-panel tv-dlr-report__filters-panel">
    <header class="tv-section-head tv-dlr-report__filters-head">
      <h2 class="tv-section-head__title">Filtros</h2>
      <p class="tv-section-head__sub">Busca por número de documento u orden</p>
    </header>
    <div class="tv-panel__body tv-dlr-report__filters-body">
      <form method="get" action="/app/invoices" class="tv-dlr-report__filters-form">
        <div class="tv-dlr-report__filters-grid tv-invoice__filters-grid">
          ${renderFilterField("Buscar", `<input type="text" name="q" class="tv-filter-input" placeholder="Nº documento o ID orden" value="${escapeHtml(filters.search ?? "")}" />`)}
          ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
          ${renderFilterField("Tipo", `<select name="document_type" class="tv-filter-input">${docOpts}</select>`)}
          ${renderFilterField("Desde", `<input type="date" name="from_date" class="tv-filter-input" value="${escapeHtml(fromVal)}" />`)}
          ${renderFilterField("Hasta", `<input type="date" name="to_date" class="tv-filter-input" value="${escapeHtml(toVal)}" />`)}
          ${renderFilterField("Método de pago", `<select name="payment_provider" class="tv-filter-input">${payOpts}</select>`)}
          <div class="tv-dlr-report__filter-actions">
            <button type="submit" class="btn btn-primary btn-sm">Aplicar</button>
            <a class="btn btn-ghost btn-sm" href="/app/invoices">Limpiar filtros</a>
          </div>
        </div>
      </form>
    </div>
  </section>`;
}

function renderEmptyState(): string {
  return `<section class="tv-panel tv-invoice-empty">
    <div class="tv-panel__body tv-coming-soon" style="padding:2.5rem 1.5rem">
      <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>
      <h2 style="margin-top:1rem;font-size:1.15rem">Todavía no tienes comprobantes</h2>
      <p class="tv-page-sub" style="max-width:420px;margin:0.5rem auto 1.25rem">
        Cuando realices una compra de bolsas SMS, tus comprobantes aparecerán aquí.
      </p>
      <div class="tv-quick-actions" style="justify-content:center">
        ${renderBtn("Comprar SMS", { href: "/app/buy-sms", variant: "primary" })}
        ${renderBtn("Ver órdenes", { href: "/app/orders", variant: "secondary" })}
      </div>
    </div>
  </section>`;
}

function renderInvoiceAction(
  opts: {
    href?: string;
    icon: string;
    label: string;
    disabled?: boolean;
    primary?: boolean;
    external?: boolean;
  },
): string {
  const tip = escapeHtml(opts.label);
  const icon = escapeHtml(opts.icon);
  if (opts.disabled) {
    return `<button type="button" class="tv-invoice-action tv-invoice-action--disabled" disabled title="${tip}" aria-label="${tip}">
      <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
      <span class="tv-invoice-action__tip">${tip}</span>
    </button>`;
  }
  const cls = [
    "tv-invoice-action",
    opts.primary ? "tv-invoice-action--primary" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const target = opts.external ? ` target="_blank" rel="noopener"` : "";
  return `<a class="${cls}" href="${opts.href ?? "#"}"${target} title="${tip}" aria-label="${tip}">
    <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
    <span class="tv-invoice-action__tip">${tip}</span>
  </a>`;
}

function renderInvoiceTable(invoices: BillingInvoice[]): string {
  if (!invoices.length) {
    return `<section class="tv-panel">
      <div class="tv-panel__body">
        <p class="tv-table-empty" style="margin:0">No hay documentos con los filtros aplicados.</p>
      </div>
    </section>`;
  }

  const rows = invoices
    .map((inv) => {
      const doc = documentNumber(inv);
      const date = formatDateShort(inv.issued_at ?? inv.created_at);
      const orderHref = `/app/orders/${escapeHtml(inv.order_id)}`;
      const detailHref = `/app/invoices/${escapeHtml(inv.id)}`;

      return `<tr>
        <td class="tv-dlr-report__date">${escapeHtml(date)}</td>
        <td><strong>${escapeHtml(doc)}</strong></td>
        <td><a href="${orderHref}">${renderOrderShortIdCell(inv.order_id)}</a></td>
        <td>${escapeHtml(documentTypeLabel(inv.document_type))}</td>
        <td>${fmtMoney(Number(inv.total_amount), inv.currency)}</td>
        <td>${invoiceStatusBadge(inv.status)}</td>
        <td class="tv-invoice-actions">
          <div class="tv-invoice-actions__group" role="group" aria-label="Acciones del documento">
            ${renderInvoiceAction({ href: detailHref, icon: "visibility", label: "Ver detalle del documento" })}
            ${renderInvoiceAction({ href: `${detailHref}/preview`, icon: "receipt_long", label: "Ver comprobante en pantalla", primary: true, external: true })}
            ${renderInvoiceAction({ href: orderHref, icon: "shopping_bag", label: "Ir a la orden de compra" })}
            ${renderInvoiceAction({ icon: "picture_as_pdf", label: "Descargar PDF (próximamente)", disabled: true })}
            ${renderInvoiceAction({ icon: "forward_to_inbox", label: "Reenviar por correo (próximamente)", disabled: true })}
          </div>
        </td>
      </tr>`;
    })
    .join("");

  return `<div class="tv-dash-block tv-dlr-report__table-block">
    <div class="tv-dash-block__head">
      <h2 class="tv-dash-block__title">Documentos</h2>
      <p class="field-hint" style="margin:0">${invoices.length} registro(s)</p>
    </div>
    <section class="tv-panel tv-client-dash-table-panel tv-dlr-report__table-panel">
      <div class="tv-client-dash-table-inner tv-dlr-report__table-inner">
        <div class="table-wrap tv-dlr-report__table-wrap">
          <table class="tv-table tv-table--dash">
            <thead><tr>
              <th>Fecha</th><th>Documento</th><th>Orden</th><th>Tipo</th><th>Monto</th>
              <th>Estado</th><th>Acciones</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </section>
  </div>`;
}

export function renderAppInvoicesPage(
  ctx: AppPageContext,
  listCtx: AppInvoiceListContext,
): string {
  const displayed = filterInvoicesForDisplay(
    listCtx.invoices,
    listCtx.filters,
    listCtx.orderById,
  );

  const body = `
    <div class="tv-dlr-report tv-client-dashboard tv-invoice-page">
    ${renderPageHeader({
      title: "Facturación",
      subtitle: "Consulta tus comprobantes, documentos de compra y estados de facturación.",
    })}
    ${renderFiltersPanel(listCtx.filters)}
    ${
      listCtx.invoices.length === 0
        ? renderEmptyState()
        : renderInvoiceTable(displayed)
    }
    </div>`;

  return wrapAppPage(ctx, "invoices", "Facturación", body);
}

function renderItemsTable(items: BillingInvoiceItem[]): string {
  if (!items.length) {
    return `<p class="field-hint" style="margin:0">Sin ítems registrados.</p>`;
  }
  const rows = items
    .map(
      (it) => `<tr>
        <td>${escapeHtml(it.description)}</td>
        <td class="tv-dlr-report__num">${escapeHtml(String(it.quantity))}</td>
        <td>${fmtMoney(Number(it.unit_price), "CLP")}</td>
        <td>${fmtMoney(Number(it.subtotal), "CLP")}</td>
        <td><strong>${fmtMoney(Number(it.total), "CLP")}</strong></td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap" style="padding:0">
    <table class="tv-table">
      <thead><tr>
        <th>Descripción</th><th>Cant.</th><th>P. unitario</th><th>Subtotal</th><th>Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderEventsTimeline(events: BillingEvent[]): string {
  if (!events.length) {
    return `<p class="field-hint" style="margin:0">Sin eventos registrados.</p>`;
  }
  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const lis = sorted
    .map(
      (e) => `<li class="tv-invoice-event">
        <time datetime="${escapeHtml(e.created_at)}">${escapeHtml(formatDate(e.created_at))}</time>
        <strong>${escapeHtml(e.event_type)}</strong>
        ${e.description ? `<span>${escapeHtml(e.description)}</span>` : ""}
      </li>`,
    )
    .join("");
  return `<ul class="tv-invoice-events">${lis}</ul>`;
}

function renderEmailLogsTable(logs: BillingEmailLog[]): string {
  if (!logs.length) {
    return `<p class="field-hint" style="margin:0">No hay envíos de correo registrados.</p>`;
  }
  const rows = [...logs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(
      (log) => `<tr>
        <td>${escapeHtml(log.to_email)}</td>
        <td>${emailStatusBadge(log.status)}</td>
        <td>${escapeHtml(log.sent_at ? formatDate(log.sent_at) : "—")}</td>
        <td class="tv-dlr-report__error-desc" title="${escapeHtml(log.error_message ?? "")}">${escapeHtml(log.error_message ?? "—")}</td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap" style="padding:0">
    <table class="tv-table">
      <thead><tr><th>Destinatario</th><th>Estado</th><th>Fecha</th><th>Error</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function renderAppInvoiceNotFoundPage(ctx: AppPageContext): string {
  const body = `
    ${renderPageHeader({
      title: "Documento no encontrado",
      subtitle: "El comprobante no existe o no pertenece a tu empresa.",
    })}
    <section class="tv-panel">
      <div class="tv-panel__body">
        <p style="margin:0 0 1rem">Verifica el enlace o vuelve al listado de facturación.</p>
        ${renderBtn("Volver a facturación", { href: "/app/invoices", variant: "primary" })}
      </div>
    </section>`;
  return wrapAppPage(ctx, "invoices", "Facturación", body);
}

export function renderAppInvoiceDetailPage(
  ctx: AppPageContext,
  invoice: BillingInvoiceWithDetails,
  order: SmsOrderRow | null,
): string {
  const doc = documentNumber(invoice);
  const provider = order?.payment_provider ?? null;

  const body = `
    <div class="tv-invoice-page tv-client-dashboard">
    ${renderPageHeader({
      title: doc,
      subtitle: `${documentTypeLabel(invoice.document_type)} · ${escapeHtml(ctx.company.name)}`,
      actions: `
        ${renderBtn("Volver a facturación", { href: "/app/invoices", variant: "secondary" })}
        ${order ? renderBtn("Ver orden", { href: `/app/orders/${order.id}`, variant: "ghost" }) : ""}
      `,
    })}
    ${renderInfoNotice()}

    <div class="tv-invoice-detail-grid">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Resumen</h2>
        <div class="tv-panel__body tv-form-grid">
          <div><dt style="font-weight:600">Número</dt><dd><code>${escapeHtml(doc)}</code></dd></div>
          <div><dt style="font-weight:600">Estado</dt><dd>${invoiceStatusBadge(invoice.status)}</dd></div>
          <div><dt style="font-weight:600">Tipo</dt><dd>${escapeHtml(documentTypeLabel(invoice.document_type))}</dd></div>
          <div><dt style="font-weight:600">Emisión</dt><dd>${escapeHtml(formatDate(invoice.issued_at ?? invoice.created_at))}</dd></div>
          <div><dt style="font-weight:600">Total</dt><dd><strong>${fmtMoney(Number(invoice.total_amount), invoice.currency)}</strong></dd></div>
          <div><dt style="font-weight:600">Moneda</dt><dd>${escapeHtml(invoice.currency)}</dd></div>
        </div>
      </section>

      <section class="tv-panel">
        <h2 class="tv-panel__title">Datos del cliente (snapshot)</h2>
        <div class="tv-panel__body tv-form-grid">
          <div><dt style="font-weight:600">Empresa</dt><dd>${escapeHtml(invoice.customer_name ?? ctx.company.name)}</dd></div>
          <div><dt style="font-weight:600">RUT</dt><dd>${escapeHtml(invoice.customer_tax_id ?? "—")}</dd></div>
          <div><dt style="font-weight:600">Email facturación</dt><dd>${escapeHtml(invoice.customer_email ?? "—")}</dd></div>
          <div><dt style="font-weight:600">País</dt><dd>${escapeHtml(invoice.customer_country ?? "CL")}</dd></div>
          <div><dt style="font-weight:600">Teléfono</dt><dd>${escapeHtml(invoice.customer_phone ?? "—")}</dd></div>
        </div>
      </section>
    </div>

    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Ítems</h2>
      <div class="tv-panel__body">${renderItemsTable(invoice.items)}</div>
    </section>

    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Orden asociada</h2>
      <div class="tv-panel__body tv-form-grid">
        ${
          order
            ? `
        <div><dt style="font-weight:600">Referencia</dt><dd><code>${escapeHtml(order.payment_reference ?? "—")}</code></dd></div>
        <div><dt style="font-weight:600">Método de pago</dt><dd>${escapeHtml(paymentMethodLabel(provider))}</dd></div>
        <div><dt style="font-weight:600">Estado pago</dt><dd>${escapeHtml(order.payment_status)}</dd></div>
        <div><dt style="font-weight:600">Estado acreditación</dt><dd>${escapeHtml(order.credit_status)}</dd></div>
        <div><dt style="font-weight:600">ID orden</dt><dd><a href="/app/orders/${escapeHtml(order.id)}">${renderOrderShortIdCell(order.id)}</a></dd></div>
        `
            : `<p class="field-hint" style="margin:0">No se pudo cargar la orden asociada.</p>`
        }
      </div>
    </section>

    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Historial</h2>
      <div class="tv-panel__body">${renderEventsTimeline(invoice.events)}</div>
    </section>

    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Correos</h2>
      <div class="tv-panel__body">${renderEmailLogsTable(invoice.email_logs)}</div>
    </section>

    <section class="tv-panel tv-panel--hint" style="margin-top:1rem">
      <h2 class="tv-panel__title">Acciones</h2>
      <div class="tv-panel__body tv-quick-actions">
        <a class="btn btn-primary btn-sm" href="/app/invoices/${escapeHtml(invoice.id)}/preview" target="_blank" rel="noopener">Ver comprobante</a>
        <button type="button" class="btn btn-secondary btn-sm" disabled title="Próximamente">Descargar PDF</button>
        <button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">Reenviar por correo</button>
      </div>
      <p class="field-hint" style="margin:0.75rem 0 0">El comprobante HTML está listo para vista previa. La descarga PDF y el reenvío por correo estarán disponibles en una próxima etapa.</p>
    </section>
    </div>`;

  return wrapAppPage(ctx, "invoices", "Facturación", body);
}
