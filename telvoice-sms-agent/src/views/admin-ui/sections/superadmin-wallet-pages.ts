import type { AdminSessionUser } from "../../../types/admin.js";
import type { CompanyRow } from "../../../types/tenant.js";
import type {
  PricingCatalogSummary,
  SmsOrderWithDetails,
  SmsPackageRow,
  WalletListRow,
  WalletTransactionRow,
} from "../../../types/wallet.js";
import {
  buildOrderTimeline,
  checkoutModeLabel,
  formatOrderShortId,
  isQaOrder,
  mercadoPagoPaymentAuditRows,
  paymentMethodLabel,
  renderSaOrderStatusBadges,
} from "../../../utils/order-display.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import {
  isCustomerVisible,
  parsePackageMetadata,
} from "../../../utils/package-metadata.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { MOCK_SA_BAGS, MOCK_SA_ORDERS, MOCK_SA_WALLETS } from "../mock-data-superadmin.js";
import { renderBtn, renderCollapsible, renderPageHeader } from "../page-kit.js";
import { renderSuperadminBanner, statusBadgeSa } from "../superadmin-kit.js";

type PageOpts = {
  admin: AdminSessionUser;
  smsBalance?: string;
  flash?: string;
  error?: string;
};

function wrap(
  opts: PageOpts,
  activeNav: string,
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
    activeNav,
    body: alert + body,
    topbar: {
      smsBalance: opts.smsBalance ?? "—",
      routesLabel: "Red global OK",
      routesOk: true,
      companyName: "Telvoice · Superadmin",
    },
  });
}

function fmtSms(n: number): string {
  return new Intl.NumberFormat("es-CL").format(n);
}

function fmtMoney(amount: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function companyOptions(companies: CompanyRow[], selected?: string): string {
  const opts = companies
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${c.id === selected ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
    )
    .join("");
  return `<option value="">— Seleccionar empresa —</option>${opts}`;
}

function renderPackageMetaFields(pkg?: SmsPackageRow): string {
  const meta = parsePackageMetadata(pkg?.metadata ?? {});
  const visible = meta.customer_visible !== false;
  const channel = meta.channel ?? "web";
  const segment = meta.segment ?? "standard";
  const visOpts = (v: boolean) =>
    `<option value="1"${v ? " selected" : ""}>Sí — visible en /app</option>
     <option value="0"${!v ? " selected" : ""}>No — solo Superadmin</option>`;
  const channelOpts = ["web", "internal", "partner"]
    .map(
      (c) =>
        `<option value="${c}"${channel === c ? " selected" : ""}>${c}</option>`,
    )
    .join("");
  const segmentOpts = ["standard", "enterprise", "promo"]
    .map(
      (s) =>
        `<option value="${s}"${segment === s ? " selected" : ""}>${s}</option>`,
    )
    .join("");
  return `
    <label>Visible para cliente (/app)
      <select name="customer_visible" class="tv-input-full">${visOpts(visible)}</select>
    </label>
    <label>Canal (metadata.channel)
      <select name="channel" class="tv-input-full">${channelOpts}</select>
    </label>
    <label>Segmento (metadata.segment)
      <select name="segment" class="tv-input-full">${segmentOpts}</select>
    </label>`;
}

function renderPricingSummary(summary: PricingCatalogSummary): string {
  const minP =
    summary.minUnitPrice != null
      ? fmtMoney(summary.minUnitPrice)
      : "—";
  const maxP =
    summary.maxUnitPrice != null
      ? fmtMoney(summary.maxUnitPrice)
      : "—";
  const updated = summary.lastUpdatedAt
    ? formatDate(summary.lastUpdatedAt)
    : "—";
  return `<div class="tv-kpi-grid" style="margin-bottom:1rem">
    <article class="tv-kpi"><span class="tv-kpi__label">Bolsas activas</span><span class="tv-kpi__value">${summary.activeCount}</span></article>
    <article class="tv-kpi"><span class="tv-kpi__label">SMS en catálogo (activas)</span><span class="tv-kpi__value">${fmtSms(summary.totalSmsInCatalog)}</span></article>
    <article class="tv-kpi"><span class="tv-kpi__label">Precio mín. / SMS</span><span class="tv-kpi__value">${minP}</span></article>
    <article class="tv-kpi"><span class="tv-kpi__label">Precio máx. / SMS</span><span class="tv-kpi__value">${maxP}</span></article>
    <article class="tv-kpi"><span class="tv-kpi__label">Visibles en /app</span><span class="tv-kpi__value">${summary.customerVisibleCount}</span></article>
    <article class="tv-kpi"><span class="tv-kpi__label">Última actualización</span><span class="tv-kpi__value" style="font-size:0.95rem">${escapeHtml(updated)}</span></article>
  </div>`;
}

function renderPackageEditForm(pkg: SmsPackageRow): string {
  const activeOpts = (active: boolean) =>
    `<option value="1"${active ? " selected" : ""}>Activa</option>
     <option value="0"${!active ? " selected" : ""}>Inactiva</option>`;

  return `<form method="post" action="/admin/pricing/${escapeHtml(pkg.id)}/update" class="tv-form-grid tv-package-edit-form">
    <label>Nombre
      <input name="name" required class="tv-input-full" value="${escapeHtml(pkg.name)}" />
    </label>
    <label>País
      <input name="country" required class="tv-input-full" value="${escapeHtml(pkg.country)}" />
    </label>
    <label>Cantidad SMS
      <input name="sms_quantity" type="number" min="1" required class="tv-input-full" value="${pkg.sms_quantity}" />
    </label>
    <label>Precio total
      <input name="total_price" type="number" min="0" step="1" required class="tv-input-full" value="${Number(pkg.total_price)}" />
    </label>
    <label>Precio unitario
      <input name="unit_price" type="number" min="0" step="0.01" class="tv-input-full"
        value="${pkg.unit_price != null ? Number(pkg.unit_price) : ""}"
        placeholder="Vacío = total ÷ cantidad" />
    </label>
    <label>Moneda
      <input name="currency" required class="tv-input-full" value="${escapeHtml(pkg.currency)}" />
    </label>
    <label>Tipo de bolsa
      <select name="package_type" class="tv-input-full">
        <option value="prepaid"${pkg.package_type === "prepaid" ? " selected" : ""}>Prepago</option>
        <option value="postpaid"${pkg.package_type === "postpaid" ? " selected" : ""}>Postpago</option>
      </select>
    </label>
    <label>Orden visual
      <input name="sort_order" type="number" step="1" class="tv-input-full" value="${pkg.sort_order}" />
    </label>
    <label>Estado
      <select name="is_active" class="tv-input-full">${activeOpts(pkg.is_active)}</select>
    </label>
    ${renderPackageMetaFields(pkg)}
    <div class="tv-form-actions">
      <button type="submit" class="btn btn-primary btn-sm">Guardar cambios</button>
    </div>
  </form>`;
}

function visibilityBadge(pkg: SmsPackageRow): string {
  return isCustomerVisible(pkg.metadata ?? {})
    ? statusBadgeSa("visible app")
    : `<span class="field-hint">Solo admin</span>`;
}

export function renderSaPricingPage(opts: PageOpts & {
  packages: SmsPackageRow[];
  catalogSummary: PricingCatalogSummary | null;
  tablesReady: boolean;
  useMock: boolean;
}): string {
  const migrationAlert = !opts.tablesReady
    ? `<div class="alert alert-error" role="alert">
        <strong>Migración 011 pendiente.</strong>
        La tabla <code>sms_packages</code> no existe en Supabase.
        Aplica <code>supabase/migrations/011_wallets_packages_orders.sql</code>
        (o <code>node scripts/apply-migration-011.mjs</code>) para crear, editar y activar bolsas reales.
        Mientras tanto se muestran datos de ejemplo.
      </div>`
    : "";

  const rows =
    opts.packages.length > 0
      ? opts.packages.map(
          (b) => `<tr>
      <td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.country)}</td><td>${fmtSms(b.sms_quantity)}</td>
      <td>${fmtMoney(Number(b.total_price), b.currency)}</td>
      <td>${b.unit_price != null ? fmtMoney(Number(b.unit_price), b.currency) : "—"}</td>
      <td>${b.sort_order}</td>
      <td>${statusBadgeSa(b.is_active ? "activa" : "suspendido")}</td>
      <td>${visibilityBadge(b)}</td>
      <td class="tv-table-actions">
        <form method="post" action="/admin/pricing/${escapeHtml(b.id)}/toggle" style="display:inline">
          <button type="submit" class="btn btn-ghost btn-sm">${b.is_active ? "Desactivar" : "Activar"}</button>
        </form>
        ${renderCollapsible("Editar bolsa", renderPackageEditForm(b))}
      </td>
    </tr>`,
        ).join("")
      : opts.useMock
        ? MOCK_SA_BAGS.map(
            (b) => `<tr>
      <td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.country)}</td><td>${escapeHtml(String(b.sms))}</td>
      <td>${escapeHtml(b.price)}</td><td>${escapeHtml(b.unit)}</td>
      <td>—</td>
      <td>${statusBadgeSa(b.status)}</td>
      <td>—</td>
      <td><span class="field-hint">Mock · sin edición</span></td>
    </tr>`,
          ).join("")
        : `<tr><td colspan="9">No hay bolsas. Crea la primera abajo o ejecuta el seed SQL opcional.</td></tr>`;

  const summaryBlock =
    opts.catalogSummary && !opts.useMock
      ? renderPricingSummary(opts.catalogSummary)
      : "";

  const createForm = `
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Crear bolsa SMS</h2>
      <div class="tv-panel__body">
        <form method="post" action="/admin/pricing" class="tv-form-grid">
          <label>Nombre <input name="name" required class="tv-input-full" placeholder="Bolsa Chile 1.000 SMS" /></label>
          <label>País <input name="country" value="CL" class="tv-input-full" /></label>
          <label>Cantidad SMS <input name="sms_quantity" type="number" min="1" required class="tv-input-full" /></label>
          <label>Precio total <input name="total_price" type="number" min="0" step="1" required class="tv-input-full" /></label>
          <label>Precio unitario <input name="unit_price" type="number" min="0" step="0.01" class="tv-input-full" placeholder="Opcional" /></label>
          <label>Moneda <input name="currency" value="CLP" class="tv-input-full" /></label>
          ${renderPackageMetaFields()}
          <div><button type="submit" class="btn btn-primary">Crear bolsa</button></div>
        </form>
      </div>
    </section>`;

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Bolsas y tarifas",
      subtitle: "Catálogo de bolsas SMS vendibles por país y volumen.",
      actions: `<a href="/admin/products" class="btn btn-ghost btn-sm">Productos legacy</a>`,
    })}
    ${migrationAlert}
    ${opts.useMock ? '<p class="field-hint tv-mock-tag">Datos de ejemplo — las acciones de crear/editar requieren migración 011.</p>' : ""}
    ${summaryBlock}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Bolsa</th><th>País</th><th>SMS</th><th>Precio venta</th><th>Unitario</th><th>Orden</th><th>Estado</th><th>/app</th><th>Acciones</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${opts.tablesReady ? createForm : `<p class="field-hint">El formulario de alta estará disponible tras aplicar la migración 011.</p>`}`;
  return wrap(opts, "pricing", "Bolsas y tarifas", body);
}

export function renderSaWalletsPage(opts: PageOpts & {
  wallets: WalletListRow[];
  companies: CompanyRow[];
  useMock: boolean;
}): string {
  const rows =
    opts.wallets.length > 0
      ? opts.wallets.map(
          (w) => `<tr>
      <td><a href="/admin/wallets/${escapeHtml(w.companyId)}" class="row-link"><strong>${escapeHtml(w.companyName)}</strong></a></td>
      <td>${escapeHtml(w.country)}</td><td>${fmtSms(w.availableSms)}</td>
      <td>${fmtSms(w.reservedSms)}</td><td>${fmtSms(w.consumedSms)}</td>
      <td>${fmtSms(w.totalPurchasedSms)}</td>
      <td>${statusBadgeSa(w.status)}</td>
      <td><a href="/admin/wallets/${escapeHtml(w.companyId)}" class="btn btn-secondary btn-sm">Detalle</a></td>
    </tr>`,
        ).join("")
      : opts.useMock
        ? MOCK_SA_WALLETS.map(
            (w) => `<tr>
      <td>${escapeHtml(w.client)}</td><td>${escapeHtml(w.country)}</td><td>${escapeHtml(w.available)}</td>
      <td>${escapeHtml(w.reserved)}</td><td>${escapeHtml(w.consumed)}</td><td>${escapeHtml(w.purchased)}</td>
      <td>${statusBadgeSa(w.status)}</td><td><span class="row-link">Mock</span></td>
    </tr>`,
          ).join("")
        : `<tr><td colspan="8">No hay empresas en <code>companies</code>. Crea clientes en migración 010 primero.</td></tr>`;

  const creditForm = opts.companies.length
    ? `<section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Carga manual rápida</h2>
      <div class="tv-panel__body">
        <form method="post" action="/admin/wallets/quick-credit" class="tv-form-grid">
          <label>Empresa
            <select name="company_id" required class="tv-input-full">${companyOptions(opts.companies)}</select>
          </label>
          <label>SMS a cargar <input name="sms_amount" type="number" min="1" required class="tv-input-full" /></label>
          <label>Descripción <input name="description" class="tv-input-full" value="Carga manual Superadmin" /></label>
          <div><button type="submit" class="btn btn-primary">Cargar saldo</button></div>
        </form>
      </div>
    </section>`
    : "";

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Saldos SMS",
      subtitle: "Wallets por empresa (company_sms_wallets).",
      actions: renderBtn("Nueva orden", { href: "/admin/orders", variant: "secondary" }),
    })}
    ${opts.useMock ? '<p class="field-hint tv-mock-tag">Datos mock — sin empresas o migración 011 pendiente.</p>' : ""}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Empresa</th><th>País</th><th>Disponible</th><th>Reservado</th><th>Consumido</th><th>Comprado</th><th>Estado</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${creditForm}`;
  return wrap(opts, "wallets", "Saldos", body);
}

export function renderSaWalletDetailPage(opts: PageOpts & {
  company: CompanyRow;
  balance: WalletListRow;
  transactions: WalletTransactionRow[];
  ratePlanHtml?: string;
}): string {
  const txRows = opts.transactions.length
    ? opts.transactions
        .map(
          (t) => `<tr>
        <td>${formatDate(t.created_at)}</td>
        <td>${escapeHtml(t.type)}</td>
        <td>${fmtSms(t.sms_amount)}</td>
        <td>${fmtSms(t.balance_before)} → ${fmtSms(t.balance_after)}</td>
        <td>${escapeHtml(t.description ?? "—")}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="5">Sin movimientos aún.</td></tr>`;

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: escapeHtml(opts.company.name),
      subtitle: `Wallet ${escapeHtml(opts.balance.country)} · ${statusBadgeSa(opts.balance.status)}`,
      actions: `<a href="/admin/wallets" class="btn btn-ghost btn-sm">← Saldos</a>`,
    })}
    <div class="tv-kpi-grid">
      <article class="tv-kpi"><span class="tv-kpi__label">Disponible</span><span class="tv-kpi__value">${fmtSms(opts.balance.availableSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Reservado</span><span class="tv-kpi__value">${fmtSms(opts.balance.reservedSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Consumido</span><span class="tv-kpi__value">${fmtSms(opts.balance.consumedSms)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Total comprado</span><span class="tv-kpi__value">${fmtSms(opts.balance.totalPurchasedSms)}</span></article>
    </div>
    ${opts.ratePlanHtml ?? ""}
    <div class="tv-dash-grid tv-dash-grid--2">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Cargar saldo</h2>
        <div class="tv-panel__body">
          <form method="post" action="/admin/wallets/${escapeHtml(opts.company.id)}/credit">
            <label>SMS <input name="sms_amount" type="number" min="1" required class="tv-input-full" /></label>
            <label>Descripción <input name="description" class="tv-input-full" value="Carga manual Superadmin" /></label>
            <button type="submit" class="btn btn-primary">Acreditar</button>
          </form>
        </div>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Descontar saldo</h2>
        <div class="tv-panel__body">
          <form method="post" action="/admin/wallets/${escapeHtml(opts.company.id)}/debit">
            <label>SMS <input name="sms_amount" type="number" min="1" required class="tv-input-full" /></label>
            <label>Descripción <input name="description" class="tv-input-full" value="Ajuste manual Superadmin" /></label>
            <button type="submit" class="btn btn-secondary">Descontar</button>
          </form>
        </div>
      </section>
    </div>
    <section class="tv-panel">
      <h2 class="tv-panel__title">Movimientos recientes</h2>
      <div class="table-wrap tv-panel__body" style="padding:0">
        <table class="tv-table tv-table--compact"><thead><tr>
          <th>Fecha</th><th>Tipo</th><th>SMS</th><th>Saldo</th><th>Descripción</th>
        </tr></thead><tbody>${txRows}</tbody></table>
      </div>
    </section>`;
  return wrap(opts, "wallets", "Detalle saldo", body);
}

function renderSaOrderQaBadge(
  order: Pick<SmsOrderWithDetails, "metadata" | "payment_reference">,
): string {
  return isQaOrder(order)
    ? ` <span class="badge badge-muted">Prueba interna</span>`
    : "";
}

export function renderSaOrdersPage(opts: PageOpts & {
  orders: SmsOrderWithDetails[];
  packages: SmsPackageRow[];
  companies: CompanyRow[];
  useMock: boolean;
}): string {
  const rows =
    opts.orders.length > 0
      ? opts.orders.map((o) => {
          const date = formatDate(o.created_at);
          const company = escapeHtml(o.company_name ?? o.company_id.slice(0, 8));
          const bag = escapeHtml(o.package_name ?? "—") + renderSaOrderQaBadge(o);
          const amount = fmtMoney(Number(o.amount), o.currency);
          const badges = renderSaOrderStatusBadges(o);
          const creditedAt = o.credited_at ? formatDate(o.credited_at) : "—";
          const ref = escapeHtml(o.payment_reference ?? "—");
          const mpPayId = o.metadata?.mercadopago_payment_id
            ? `<div class="field-hint">Pay: <code>${escapeHtml(String(o.metadata.mercadopago_payment_id))}</code></div>`
            : "";
          const credited = o.credit_status === "credited";
          const cancelled = o.payment_status === "cancelled";
          const canCancel =
            o.payment_status === "pending" && o.credit_status !== "credited";
          const actions = credited
            ? `<a href="/admin/orders/${escapeHtml(o.id)}" class="btn btn-ghost btn-sm">Ver detalle</a>
               <span class="field-hint">Ya acreditada</span>`
            : cancelled
              ? `<a href="/admin/orders/${escapeHtml(o.id)}" class="btn btn-ghost btn-sm">Ver detalle</a>
                 <span class="field-hint">Cancelada</span>`
              : `<a href="/admin/orders/${escapeHtml(o.id)}" class="btn btn-ghost btn-sm">Ver detalle</a>
               ${canCancel ? `<form method="post" action="/admin/orders/${escapeHtml(o.id)}/cancel" style="display:inline;margin-left:0.25rem" onsubmit="return confirm('¿Cancelar esta orden pendiente? No modifica el saldo.');">
                   <button type="submit" class="btn btn-ghost btn-sm">Cancelar</button>
                 </form>` : ""}
               ${o.payment_status === "pending" ? `<form method="post" action="/admin/orders/${escapeHtml(o.id)}/mark-paid" style="display:inline;margin-left:0.25rem">
                   <button type="submit" class="btn btn-ghost btn-sm">Marcar pagada</button>
                 </form>` : ""}
               ${!cancelled ? `<form method="post" action="/admin/orders/${escapeHtml(o.id)}/credit" style="display:inline;margin-left:0.25rem">
                 <button type="submit" class="btn btn-primary btn-sm">Acreditar</button>
               </form>` : ""}`;
          return `<tr>
      <td>${date}</td><td>${company}</td><td>${bag}</td>
      <td>${fmtSms(o.sms_quantity)}</td><td>${amount}</td>
      <td>${badges}${mpPayId}</td>
      <td><code>${ref}</code></td>
      <td>${statusBadgeSa(o.payment_status)}</td><td>${statusBadgeSa(o.credit_status === "credited" ? "acreditada" : o.credit_status)}</td>
      <td>${creditedAt}</td>
      <td class="tv-table-actions">${actions}</td>
    </tr>`;
        }).join("")
      : opts.useMock
        ? MOCK_SA_ORDERS.map(
            (o) => `<tr>
      <td>${escapeHtml(o.date)}</td><td>${escapeHtml(o.client)}</td><td>${escapeHtml(o.bag)}</td>
      <td>${escapeHtml(String(o.qty))}</td><td>${escapeHtml(o.amount)}</td><td>${escapeHtml(o.payment)}</td>
      <td>${statusBadgeSa(o.payStatus)}</td><td>${statusBadgeSa(o.creditStatus)}</td><td>Mock</td>
    </tr>`,
          ).join("")
        : `<tr><td colspan="11">Sin órdenes. Crea una orden manual abajo.</td></tr>`;

  const createForm =
    opts.companies.length && opts.packages.length
      ? `<section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Nueva orden manual</h2>
      <div class="tv-panel__body">
        <form method="post" action="/admin/orders" class="tv-form-grid">
          <label>Empresa <select name="company_id" required class="tv-input-full">${companyOptions(opts.companies)}</select></label>
          <label>Bolsa <select name="package_id" required class="tv-input-full">
            ${opts.packages.filter((p) => p.is_active).map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${fmtSms(p.sms_quantity)} SMS</option>`).join("")}
          </select></label>
          <label>Referencia pago <input name="payment_reference" class="tv-input-full" placeholder="Opcional" /></label>
          <div><button type="submit" class="btn btn-primary">Crear orden</button></div>
        </form>
      </div>
    </section>`
      : `<p class="field-hint">Crea empresas y bolsas antes de generar órdenes manuales.</p>`;

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Compras",
      subtitle: "Órdenes de bolsas SMS y acreditación de wallet.",
    })}
    ${opts.useMock ? '<p class="field-hint tv-mock-tag">Datos mock activos.</p>' : ""}
    <div class="table-wrap tv-panel"><table class="tv-table"><thead><tr>
      <th>Fecha</th><th>Empresa</th><th>Bolsa</th><th>SMS</th><th>Monto</th><th>Etiquetas</th><th>Referencia</th><th>Estado pago</th><th>Acreditación</th><th>Acreditada el</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${createForm}`;
  return wrap(opts, "orders", "Compras", body);
}

function renderSaOrderTimeline(
  order: Pick<
    SmsOrderWithDetails,
    "created_at" | "payment_status" | "credit_status" | "credited_at"
  >,
): string {
  const steps = buildOrderTimeline(order);
  const items = steps
    .map((s) => {
      const icon =
        s.state === "done"
          ? "check_circle"
          : s.state === "current"
            ? "pending"
            : "radio_button_unchecked";
      return `<li class="tv-timeline__item tv-timeline__item--${s.state}">
        <span class="material-symbols-outlined tv-timeline__icon" aria-hidden="true">${icon}</span>
        <div><strong>${escapeHtml(s.title)}</strong><p class="field-hint" style="margin:0.15rem 0 0">${escapeHtml(s.detail)}</p></div>
      </li>`;
    })
    .join("");
  return `<ol class="tv-timeline">${items}</ol>`;
}

export function renderSaOrderDetailPage(
  opts: PageOpts & {
    order: SmsOrderWithDetails;
    transactions: WalletTransactionRow[];
    company: CompanyRow | null;
  },
): string {
  const o = opts.order;
  const credited = o.credit_status === "credited";
  const cancelled = o.payment_status === "cancelled";
  const canCancel =
    o.payment_status === "pending" && o.credit_status !== "credited";
  const shortId = formatOrderShortId(o.id);

  const creditWarning = credited
    ? `<div class="alert alert-success" role="status">Esta orden ya fue acreditada. No se duplicará saldo al volver a acreditar.</div>`
    : "";

  const adminActions = credited
    ? `<p class="field-hint">Orden acreditada — no hay acciones de saldo pendientes.</p>
       <button type="button" class="btn btn-secondary btn-sm" disabled>Ya acreditada</button>`
    : cancelled
      ? `<p class="field-hint">Orden cancelada. No se puede acreditar ni reanudar el pago desde aquí.</p>`
      : `<div class="tv-quick-actions">
         ${canCancel ? `<form method="post" action="/admin/orders/${escapeHtml(o.id)}/cancel" onsubmit="return confirm('¿Cancelar esta orden pendiente? No modifica el saldo de la empresa.');">
           <button type="submit" class="btn btn-secondary">Cancelar orden pendiente</button>
         </form>` : ""}
         ${o.payment_status === "pending" ? `<form method="post" action="/admin/orders/${escapeHtml(o.id)}/mark-paid">
           <button type="submit" class="btn btn-secondary">Marcar pagada</button>
         </form>` : ""}
         <form method="post" action="/admin/orders/${escapeHtml(o.id)}/credit">
           <button type="submit" class="btn btn-primary">Acreditar orden</button>
         </form>
       </div>`;

  const auditRowsList = mercadoPagoPaymentAuditRows(o);
  const auditRowsHtml = auditRowsList
    .map(
      (row) =>
        `<div><dt>${escapeHtml(row.label)}</dt><dd><code>${escapeHtml(row.value)}</code></dd></div>`,
    )
    .join("");

  const txRows = opts.transactions.length
    ? opts.transactions
        .map(
          (t) => `<tr>
        <td>${formatDate(t.created_at)}</td>
        <td>${escapeHtml(t.type)}</td>
        <td>${fmtSms(t.sms_amount)}</td>
        <td>${escapeHtml(t.description ?? "—")}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4">Sin movimientos de wallet vinculados a esta orden.</td></tr>`;

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Detalle de orden",
      subtitle: `Ref. ${escapeHtml(o.payment_reference ?? "—")} · ID ${escapeHtml(shortId)}`,
      actions: renderBtn("Volver a compras", { href: "/admin/orders", variant: "secondary" }),
    })}
    ${creditWarning}
    <div class="tv-dash-grid tv-dash-grid--2">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Cliente y empresa</h2>
        <dl class="tv-detail-dl tv-panel__body">
          <div><dt>Empresa</dt><dd>${escapeHtml(opts.company?.name ?? o.company_name ?? "—")}</dd></div>
          <div><dt>ID empresa</dt><dd><code>${escapeHtml(o.company_id)}</code></dd></div>
          <div><dt>Bolsa</dt><dd>${escapeHtml(o.package_name ?? "—")}${renderSaOrderQaBadge(o)}</dd></div>
          <div><dt>SMS</dt><dd>${fmtSms(o.sms_quantity)}</dd></div>
          <div><dt>Monto</dt><dd>${fmtMoney(Number(o.amount), o.currency)}</dd></div>
        </dl>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Estados</h2>
        <dl class="tv-detail-dl tv-panel__body">
          <div><dt>Etiquetas</dt><dd>${renderSaOrderStatusBadges(o)}</dd></div>
          <div><dt>Estado pago</dt><dd>${statusBadgeSa(o.payment_status)}</dd></div>
          <div><dt>Acreditación</dt><dd>${statusBadgeSa(o.credit_status === "credited" ? "acreditada" : o.credit_status)}</dd></div>
          <div><dt>Creada</dt><dd>${formatDate(o.created_at)}</dd></div>
          <div><dt>Acreditada</dt><dd>${o.credited_at ? formatDate(o.credited_at) : "—"}</dd></div>
          <div><dt>Método pago</dt><dd>${escapeHtml(paymentMethodLabel(o.payment_provider))}</dd></div>
          <div><dt>Checkout</dt><dd>${escapeHtml(checkoutModeLabel(o.metadata))}</dd></div>
          <div><dt>Origen</dt><dd>${escapeHtml(String(o.metadata?.source ?? "—"))}</dd></div>
        </dl>
      </section>
    </div>
    <div class="tv-dash-grid tv-dash-grid--2" style="margin-top:1rem">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Timeline</h2>
        <div class="tv-panel__body">${renderSaOrderTimeline(o)}</div>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Acciones administrativas</h2>
        <div class="tv-panel__body">${adminActions}</div>
      </section>
    </div>
    ${
      auditRowsList.length &&
      (o.payment_provider === "mercadopago" ||
        o.metadata?.checkout_mode === "mercadopago")
        ? `<section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Auditoría de pago</h2>
      <dl class="tv-detail-dl tv-panel__body">${auditRowsHtml}</dl>
    </section>`
        : ""
    }
    <section class="tv-panel tv-panel--hint" style="margin-top:1rem">
      <h2 class="tv-panel__title">Facturación</h2>
      <div class="tv-panel__body">
        <p class="field-hint" style="margin:0">Adjuntar comprobante / factura — próximamente.</p>
      </div>
    </section>
    <section class="tv-panel" style="margin-top:1rem">
      <h2 class="tv-panel__title">Movimientos wallet (orden)</h2>
      <div class="table-wrap tv-panel__body" style="padding:0">
        <table class="tv-table tv-table--compact"><thead><tr>
          <th>Fecha</th><th>Tipo</th><th>SMS</th><th>Descripción</th>
        </tr></thead><tbody>${txRows}</tbody></table>
      </div>
    </section>`;

  return wrap(opts, "orders", "Detalle orden", body);
}
