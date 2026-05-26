import type {
  AdminInvoiceDetail,
  BillingInvoiceItem,
  BillingInvoiceWithDetails,
} from "../types/billing.js";
import type { CompanyRow } from "../types/tenant.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { formatOrderShortId, paymentMethodLabel } from "../utils/order-display.js";
import { escapeHtml, formatDate } from "../utils/html.js";
import { getAdminInvoiceById } from "./billingInvoiceService.js";
import { recordBillingEvent } from "./billingEventService.js";

export type BillingDocumentData = {
  documentNumber: string;
  documentTypeLabel: string;
  issuedAt: string;
  invoiceId: string;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  customer: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    country: string;
  };
  order: {
    id: string;
    shortId: string;
    reference: string | null;
    paymentProvider: string | null;
    paymentStatus: string;
    creditStatus: string;
    purchasedAt: string;
  } | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    taxAmount: number;
    total: number;
  }>;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function shortDocId(id: string): string {
  return id.replaceAll("-", "").slice(0, 8).toUpperCase();
}

function documentNumber(invoice: {
  id: string;
  invoice_number: string | null;
}): string {
  return invoice.invoice_number?.trim() || `DOC-${shortDocId(invoice.id)}`;
}

function documentTypeLabel(type: string): string {
  const map: Record<string, string> = {
    purchase_receipt: "Comprobante de compra",
    invoice: "Documento comercial",
    tax_invoice: "Documento tributario (no emitido)",
    credit_note: "Nota de crédito",
    manual_receipt: "Recibo manual",
  };
  return map[type] ?? "Comprobante interno de compra";
}

function fmtMoney(amount: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function safeText(value: string | null | undefined, fallback = "—"): string {
  const t = value?.trim();
  return t ? escapeHtml(t) : fallback;
}

export function sanitizeInvoiceDocumentData(input: {
  invoice: BillingInvoiceWithDetails;
  company?: CompanyRow | null;
  order?: SmsOrderRow | null;
}): BillingDocumentData {
  const inv = input.invoice;
  const company = input.company;
  const order = input.order;

  const mapItem = (it: BillingInvoiceItem) => ({
    description: it.description,
    quantity: toNumber(it.quantity),
    unitPrice: toNumber(it.unit_price),
    subtotal: toNumber(it.subtotal),
    taxAmount: toNumber(it.tax_amount),
    total: toNumber(it.total),
  });

  return {
    documentNumber: documentNumber(inv),
    documentTypeLabel: documentTypeLabel(inv.document_type),
    issuedAt: inv.issued_at ?? inv.created_at,
    invoiceId: inv.id,
    currency: inv.currency || "CLP",
    subtotalAmount: toNumber(inv.subtotal_amount),
    taxAmount: toNumber(inv.tax_amount),
    totalAmount: toNumber(inv.total_amount),
    taxRate: toNumber(inv.tax_rate),
    customer: {
      name: company?.name ?? inv.customer_name ?? "Cliente",
      legalName: company?.legal_name ?? inv.customer_legal_name ?? null,
      taxId: company?.rut ?? inv.customer_tax_id ?? null,
      email: company?.billing_email ?? inv.customer_email ?? null,
      phone: company?.contact_phone ?? inv.customer_phone ?? null,
      country: company?.country ?? inv.customer_country ?? "CL",
    },
    order: order
      ? {
          id: order.id,
          shortId: formatOrderShortId(order.id),
          reference: order.payment_reference,
          paymentProvider: order.payment_provider,
          paymentStatus: order.payment_status,
          creditStatus: order.credit_status,
          purchasedAt: order.created_at,
        }
      : {
          id: inv.order_id,
          shortId: formatOrderShortId(inv.order_id),
          reference:
            typeof inv.metadata?.order_payment_reference === "string"
              ? inv.metadata.order_payment_reference
              : null,
          paymentProvider:
            typeof inv.metadata?.order_payment_provider === "string"
              ? inv.metadata.order_payment_provider
              : null,
          paymentStatus: String(inv.payment_status ?? "—"),
          creditStatus: "—",
          purchasedAt: inv.created_at,
        },
    items: (inv.items ?? []).map(mapItem),
  };
}

function renderItemsRows(items: BillingDocumentData["items"]): string {
  if (!items.length) {
    return `<tr><td colspan="5" class="muted">Sin ítems registrados</td></tr>`;
  }
  return items
    .map(
      (it) => `<tr>
        <td>${escapeHtml(it.description)}</td>
        <td class="num">${escapeHtml(String(it.quantity))}</td>
        <td class="num">${fmtMoney(it.unitPrice)}</td>
        <td class="num">${fmtMoney(it.subtotal)}</td>
        <td class="num"><strong>${fmtMoney(it.total)}</strong></td>
      </tr>`,
    )
    .join("");
}

export function generateInvoiceHtmlFromData(data: BillingDocumentData): string {
  const order = data.order;
  const paymentLabel = order
    ? escapeHtml(paymentMethodLabel(order.paymentProvider))
    : "—";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.documentNumber)} — Comprobante Telvoice</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 16px 40px;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.45;
      color: #0f172a;
      background: #eef2f7;
    }
    .sheet {
      max-width: 820px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #dbe3ef;
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      padding: 28px 32px 22px;
      background: linear-gradient(135deg, #0052cc 0%, #003d99 100%);
      color: #fff;
    }
    .brand { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }
    .brand-sub { opacity: 0.9; font-size: 0.85rem; margin-top: 4px; }
    .doc-meta { text-align: right; }
    .doc-meta .num { font-size: 1.1rem; font-weight: 700; }
    .doc-meta .date { opacity: 0.9; font-size: 0.85rem; margin-top: 6px; }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; justify-content: flex-end; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-warn { background: rgba(255,255,255,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.35); }
    .badge-muted { background: #f1f5f9; color: #475569; }
    .body { padding: 28px 32px 32px; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .block {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 18px;
      background: #fafbfc;
    }
    .block h2 {
      margin: 0 0 12px;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
    }
    .kv { margin: 0; }
    .kv div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid #edf2f7; }
    .kv div:last-child { border-bottom: none; }
    .kv dt { color: #64748b; font-weight: 500; }
    .kv dd { margin: 0; text-align: right; font-weight: 600; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 20px;
      font-size: 0.88rem;
    }
    table.items th {
      text-align: left;
      padding: 10px 12px;
      background: #f1f5f9;
      color: #475569;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid #e2e8f0;
    }
    table.items td {
      padding: 10px 12px;
      border-bottom: 1px solid #edf2f7;
      vertical-align: top;
    }
    table.items .num { text-align: right; white-space: nowrap; }
    .totals {
      margin-left: auto;
      max-width: 320px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }
    .totals .row {
      display: flex;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid #edf2f7;
    }
    .totals .row.total {
      background: #0052cc;
      color: #fff;
      font-size: 1.05rem;
      font-weight: 800;
      border-bottom: none;
    }
    .legal {
      margin-top: 24px;
      padding: 14px 16px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      font-size: 0.8rem;
      color: #78350f;
      line-height: 1.5;
    }
    .footer {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 0.78rem;
      color: #64748b;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
    }
    .muted { color: #94a3b8; }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border: none; max-width: none; }
    }
    @media (max-width: 640px) {
      .head { flex-direction: column; }
      .doc-meta { text-align: left; }
      .badges { justify-content: flex-start; }
      .grid-2 { grid-template-columns: 1fr; }
      .body { padding: 20px 16px; }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <header class="head">
      <div>
        <div class="brand">Telvoice</div>
        <div class="brand-sub">Comprobante interno de compra</div>
      </div>
      <div class="doc-meta">
        <div class="num">${escapeHtml(data.documentNumber)}</div>
        <div class="date">Emisión: ${escapeHtml(formatDate(data.issuedAt))}</div>
        <div class="badges">
          <span class="badge badge-warn">Documento no tributario</span>
          <span class="badge badge-warn">Respaldo operacional</span>
        </div>
      </div>
    </header>
    <div class="body">
      <div class="grid-2">
        <section class="block">
          <h2>Datos del cliente</h2>
          <dl class="kv">
            <div><dt>Empresa</dt><dd>${safeText(data.customer.name)}</dd></div>
            <div><dt>Razón social</dt><dd>${safeText(data.customer.legalName)}</dd></div>
            <div><dt>RUT</dt><dd>${safeText(data.customer.taxId)}</dd></div>
            <div><dt>Email facturación</dt><dd>${safeText(data.customer.email)}</dd></div>
            <div><dt>Teléfono</dt><dd>${safeText(data.customer.phone)}</dd></div>
            <div><dt>País</dt><dd>${safeText(data.customer.country)}</dd></div>
          </dl>
        </section>
        <section class="block">
          <h2>Orden asociada</h2>
          <dl class="kv">
            <div><dt>Referencia</dt><dd>${safeText(order?.reference)}</dd></div>
            <div><dt>ID orden</dt><dd><code>${escapeHtml(order?.shortId ?? "—")}</code></dd></div>
            <div><dt>Método de pago</dt><dd>${paymentLabel}</dd></div>
            <div><dt>Estado pago</dt><dd>${escapeHtml(order?.paymentStatus ?? "—")}</dd></div>
            <div><dt>Acreditación</dt><dd>${escapeHtml(order?.creditStatus ?? "—")}</dd></div>
            <div><dt>Fecha compra</dt><dd>${order ? escapeHtml(formatDate(order.purchasedAt)) : "—"}</dd></div>
            <div><dt>Moneda</dt><dd>${escapeHtml(data.currency)}</dd></div>
          </dl>
        </section>
      </div>

      <h2 style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin:0 0 8px">Detalle de la compra</h2>
      <table class="items">
        <thead>
          <tr>
            <th>Descripción</th>
            <th class="num">Cant.</th>
            <th class="num">P. unitario</th>
            <th class="num">Subtotal</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>${renderItemsRows(data.items)}</tbody>
      </table>

      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${fmtMoney(data.subtotalAmount, data.currency)}</span></div>
        <div class="row"><span>Impuestos (${escapeHtml(String(data.taxRate))}%)</span><span>${fmtMoney(data.taxAmount, data.currency)}</span></div>
        <div class="row total"><span>Total</span><span>${fmtMoney(data.totalAmount, data.currency)}</span></div>
      </div>

      <p class="legal">
        Este documento corresponde a un <strong>comprobante interno de compra</strong> emitido por Telvoice para fines operativos y de respaldo.
        <strong>No corresponde a una factura tributaria</strong> ni reemplaza documentación fiscal emitida por un proveedor autorizado.
      </p>

      <footer class="footer">
        <span>Telvoice · Mensajería SMS empresarial</span>
        <span><a href="https://www.telvoice.cl" style="color:#0052cc">www.telvoice.cl</a> · soporte@telvoice.cl</span>
        <span class="muted">ID documento: ${escapeHtml(data.invoiceId)}</span>
      </footer>
    </div>
  </article>
</body>
</html>`;
}

export async function generateInvoiceHtml(invoiceId: string): Promise<string | null> {
  const detail = await getAdminInvoiceById(invoiceId);
  if (!detail) {
    return null;
  }
  const data = sanitizeInvoiceDocumentData({
    invoice: detail,
    company: detail.company,
    order: detail.order,
  });
  return generateInvoiceHtmlFromData(data);
}

async function ensureGeneratedEventOnce(
  invoiceId: string,
  companyId: string,
  events: BillingInvoiceWithDetails["events"],
): Promise<void> {
  const hasGenerated = (events ?? []).some(
    (e) => e.event_type === "invoice.generated",
  );
  if (hasGenerated) {
    return;
  }
  await recordBillingEvent({
    invoiceId,
    companyId,
    eventType: "invoice.generated",
    description: "Comprobante HTML generado por primera vez.",
    actorType: "system",
    actorId: null,
    metadata: { source: "billingDocumentService" },
  });
}

export async function getInvoiceDocumentPreview(
  invoiceId: string,
): Promise<{ html: string; documentNumber: string } | null> {
  const detail = await getAdminInvoiceById(invoiceId);
  if (!detail) {
    return null;
  }

  const data = sanitizeInvoiceDocumentData({
    invoice: detail,
    company: detail.company,
    order: detail.order,
  });

  await ensureGeneratedEventOnce(
    detail.id,
    detail.company_id,
    detail.events,
  );

  return {
    html: generateInvoiceHtmlFromData(data),
    documentNumber: data.documentNumber,
  };
}

export function wrapAdminDocumentPreview(
  documentHtml: string,
  options: {
    invoiceId: string;
    documentNumber: string;
    backHref: string;
  },
): string {
  const bar = `<div style="position:sticky;top:0;z-index:10;background:#0f172a;color:#fff;padding:10px 16px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;font-family:system-ui,sans-serif;font-size:13px">
    <span><strong>Telvoice Superadmin</strong> · Vista previa · ${escapeHtml(options.documentNumber)} · Documento interno no tributario</span>
    <span style="display:flex;gap:8px;align-items:center">
      <a href="${escapeHtml(options.backHref)}" style="color:#93c5fd">← Volver al detalle</a>
      <button type="button" disabled style="opacity:0.5;padding:4px 10px;border-radius:6px;border:1px solid #475569;background:transparent;color:#fff;cursor:not-allowed" title="Próximamente">PDF</button>
    </span>
  </div>`;

  const bodyMatch = documentHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const inner = bodyMatch ? bodyMatch[1] : documentHtml;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.documentNumber)} — Preview Superadmin</title>
</head>
<body style="margin:0">
  ${bar}
  ${inner}
</body>
</html>`;
}

export function buildPreviewFromDetail(detail: AdminInvoiceDetail): string {
  const data = sanitizeInvoiceDocumentData({
    invoice: detail,
    company: detail.company,
    order: detail.order,
  });
  return generateInvoiceHtmlFromData(data);
}
