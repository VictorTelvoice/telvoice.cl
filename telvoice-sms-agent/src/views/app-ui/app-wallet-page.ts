import type { WalletTransactionRow } from "../../types/wallet.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderBtn, renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import {
  renderTxQaBadgeIfNeeded,
  renderWalletTxTypeBadge,
} from "./app-order-ui.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";

export type WalletPageFilters = {
  type?: string;
  startDate?: string;
  endDate?: string;
};

const WALLET_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todos los tipos" },
  { value: "purchase_credit", label: "Compra acreditada" },
  { value: "manual_credit", label: "Carga manual" },
  { value: "manual_debit", label: "Descuento manual" },
  { value: "sms_debit", label: "Consumo SMS" },
  { value: "sms_refund", label: "Devolución" },
  { value: "reserve", label: "Reserva" },
  { value: "release_reserved", label: "Liberación reserva" },
  { value: "adjustment", label: "Ajuste" },
  { value: "reversal", label: "Reversión" },
];

export function parseWalletPageFilters(
  query: Record<string, string | string[] | undefined>,
): WalletPageFilters {
  const str = (key: string): string | undefined => {
    const v = query[key];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
    return undefined;
  };
  return {
    type: str("type"),
    startDate: str("start_date"),
    endDate: str("end_date"),
  };
}

function walletQueryString(filters: WalletPageFilters): string {
  const p = new URLSearchParams();
  if (filters.type) {
    p.set("type", filters.type);
  }
  if (filters.startDate) {
    p.set("start_date", filters.startDate);
  }
  if (filters.endDate) {
    p.set("end_date", filters.endDate);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function renderTypeSelect(selected?: string): string {
  const current = selected ?? "";
  const opts = WALLET_TYPE_OPTIONS.map((o) => {
    const on = current === o.value;
    return `<option value="${escapeHtml(o.value)}"${on ? " selected" : ""}>${escapeHtml(o.label)}</option>`;
  }).join("");
  return `<select name="type" class="tv-filter-input">${opts}</select>`;
}

function renderWalletKpis(
  ctx: AppPageContext,
  transactions: WalletTransactionRow[],
): string {
  const b = ctx.balance;
  return `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
      ${renderKpiCard({
        label: "Disponible",
        value: fmtSms(b.availableSms),
        hint: "SMS listos para enviar",
        icon: "account_balance_wallet",
        variant: "primary",
      })}
      ${renderKpiCard({
        label: "Reservado",
        value: fmtSms(b.reservedSms),
        hint: "SMS en campañas o reservas",
        icon: "lock",
        variant: "warn",
      })}
      ${renderKpiCard({
        label: "Consumido",
        value: fmtSms(b.consumedSms),
        hint: "Total histórico enviado",
        icon: "send",
        variant: "default",
      })}
      ${renderKpiCard({
        label: "Total comprado",
        value: fmtSms(b.totalPurchasedSms),
        hint: "Acreditaciones acumuladas",
        icon: "shopping_cart",
        variant: "success",
      })}
      ${renderKpiCard({
        label: "Movimientos",
        value: fmtSms(transactions.length),
        hint: "Con filtros aplicados",
        icon: "receipt_long",
        variant: "default",
      })}
      ${renderKpiCard({
        label: "Estado wallet",
        value: b.status === "active" ? "Activa" : b.status,
        hint: "Cuenta SMS de la empresa",
        icon: "verified",
        variant: b.status === "active" ? "success" : "warn",
      })}
    </div>`;
}

function renderWalletTableRows(transactions: WalletTransactionRow[]): string {
  if (!transactions.length) {
    return `<tr><td colspan="6" class="tv-table-empty">No hay movimientos con los filtros aplicados.</td></tr>`;
  }
  return transactions
    .map(
      (t) => `<tr>
        <td class="tv-wallet-report__date">${formatDate(t.created_at)}</td>
        <td>${renderWalletTxTypeBadge(t.type)}${renderTxQaBadgeIfNeeded(t)}</td>
        <td class="tv-wallet-report__num">${fmtSms(t.sms_amount)}</td>
        <td class="tv-wallet-report__num">${fmtSms(t.balance_before)}</td>
        <td class="tv-wallet-report__num">${fmtSms(t.balance_after)}</td>
        <td>${escapeHtml(t.description ?? "—")}</td>
      </tr>`,
    )
    .join("");
}

export function renderAppWalletPage(
  ctx: AppPageContext,
  transactions: WalletTransactionRow[],
  filters: WalletPageFilters,
): string {
  const filterQs = walletQueryString(filters);
  const typeLabel =
    WALLET_TYPE_OPTIONS.find((o) => o.value === (filters.type ?? ""))?.label ??
    "Todos los tipos";

  const filtersPanel = `
    <section class="tv-panel tv-dlr-report__filters-panel">
      <header class="tv-section-head tv-dlr-report__filters-head">
        <h2 class="tv-section-head__title">Filtros de búsqueda</h2>
        <p class="tv-section-head__sub">Filtra movimientos por período y tipo de transacción</p>
      </header>
      <div class="tv-panel__body tv-dlr-report__filters-body">
        <form method="get" action="/app/wallet" class="tv-dlr-report__filters-form">
          <div class="tv-dlr-report__filters-grid tv-wallet-report__filters-grid">
            ${renderFilterField("Desde", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(filters.startDate ?? "")}" />`)}
            ${renderFilterField("Hasta", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(filters.endDate ?? "")}" />`)}
            ${renderFilterField("Tipo", renderTypeSelect(filters.type))}
            <div class="tv-dlr-report__filter-actions">
              <button type="submit" class="btn btn-primary btn-sm">Buscar movimientos</button>
              <a class="btn btn-ghost btn-sm" href="/app/wallet">Limpiar</a>
            </div>
          </div>
        </form>
      </div>
    </section>`;

  const body = `
    <div class="tv-wallet-report tv-dlr-report tv-client-dashboard">
    ${renderPageHeader({
      title: "Mi saldo",
      subtitle: `Resumen de ${escapeHtml(ctx.company.name)}`,
      actions: renderBtn("Comprar SMS", {
        href: "/app/buy-sms",
        variant: "primary",
        icon: "shopping_cart",
      }),
    })}
    ${renderWalletKpis(ctx, transactions)}
    ${filtersPanel}
    <div class="tv-dash-block tv-dlr-report__table-block">
      <div class="tv-dash-block__head">
        <h2 class="tv-dash-block__title">Movimientos de saldo</h2>
        <span class="tv-wallet-report__filter-hint">${escapeHtml(typeLabel)}</span>
      </div>
      <section class="tv-panel tv-client-dash-table-panel tv-dlr-report__table-panel">
        <div class="tv-client-dash-table-inner tv-dlr-report__table-inner">
          <div class="table-wrap tv-dlr-report__table-wrap tv-wallet-report__table-wrap">
            <table class="tv-table tv-table--dash tv-wallet-report__table">
              <thead><tr>
                <th>Fecha</th><th>Tipo</th><th>Cantidad SMS</th><th>Saldo antes</th><th>Saldo después</th><th>Descripción</th>
              </tr></thead>
              <tbody>${renderWalletTableRows(transactions)}</tbody>
            </table>
          </div>
          <div class="tv-dlr-report__pager">
            <span class="field-hint">${transactions.length} movimiento${transactions.length === 1 ? "" : "s"} mostrados (máx. 200)</span>
            ${filterQs ? `<a class="btn btn-ghost btn-sm" href="/app/wallet">Quitar filtros</a>` : ""}
          </div>
        </div>
      </section>
    </div>
    </div>`;

  return wrapAppPage(ctx, "wallet", "Mi saldo", body);
}
