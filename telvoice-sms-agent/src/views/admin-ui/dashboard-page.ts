import type { AdminSessionUser } from "../../types/admin.js";
import type { AdminDashboardSnapshot } from "../../types/adminDashboard.js";
import type { AsmscBalanceSummary } from "../../utils/asmsc-balance-summary.js";
import type { BalanceRow, SmsMessageRow } from "../../types/database.js";
import type { SmsMessageStats } from "../../services/smsMessageService.js";
import type { TestClientBundle } from "../../services/clientService.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { getConfiguredDlrWebhookUrl } from "../../utils/dlr-callback.js";
import { statusBadge } from "./badges.js";
import {
  renderChartBars,
  renderKpiCard,
  renderQuickAction,
  renderSectionTitle,
} from "./components.js";
import { renderPageHeader } from "./page-kit.js";
import {
  renderClientPanelNotice,
  renderSuperadminBanner,
  statusBadgeSa,
} from "./superadmin-kit.js";

function fmtN(n: number): string {
  return new Intl.NumberFormat("es-CL").format(n);
}

function dashValue(snapshot: AdminDashboardSnapshot | null | undefined, value: number): string {
  if (!snapshot) return "—";
  return fmtN(value);
}

export function renderDashboardBody(options: {
  admin: AdminSessionUser;
  serviceOk: boolean;
  testClient: TestClientBundle | null;
  balance: BalanceRow | null;
  messages: SmsMessageRow[];
  stats: SmsMessageStats | null;
  asmscBalance: AsmscBalanceSummary | null;
  supabaseConfigured: boolean;
  configWarning?: string | null;
  successMessage?: string | null;
  dlrWebhookUrl?: string;
  dashboardSnapshot?: AdminDashboardSnapshot | null;
}): string {
  const warningBlock = options.configWarning
    ? `<div class="alert alert-error">${escapeHtml(options.configWarning)}</div>`
    : "";
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";

  const snap = options.dashboardSnapshot;
  const scopeHint = snap
    ? `Solo clientes producción real (${snap.productionCompanyCount} empresas).`
    : "Sin datos reales disponibles.";

  const kpiGrid = `<div class="tv-kpi-grid tv-kpi-grid--dense">
    ${renderKpiCard({ label: "Clientes activos", value: dashValue(snap, snap?.activeClients ?? 0), hint: scopeHint, icon: "business", variant: "primary" })}
    ${renderKpiCard({ label: "SMS enviados hoy", value: dashValue(snap, snap?.smsToday ?? 0), hint: "Panel live · clientes reales", icon: "today", variant: "default" })}
    ${renderKpiCard({ label: "SMS enviados (mes)", value: dashValue(snap, snap?.smsMonth ?? 0), hint: "Mes calendario Chile", icon: "calendar_month", variant: "default" })}
    ${renderKpiCard({ label: "Saldo total vendido", value: dashValue(snap, snap?.totalPurchasedSms ?? 0), hint: "Wallets clientes reales", icon: "sell", variant: "primary" })}
    ${renderKpiCard({ label: "Saldo consumido", value: dashValue(snap, snap?.totalConsumedSms ?? 0), hint: "Débitos por envío", icon: "trending_down", variant: "warn" })}
    ${renderKpiCard({ label: "Campañas activas", value: dashValue(snap, snap?.activeCampaigns ?? 0), hint: "Estado processing", icon: "campaign", variant: "default" })}
    ${renderKpiCard({ label: "Tasa entrega", value: snap?.deliveryRate ?? "Sin datos", hint: "Entregados / enviados mes", icon: "check_circle", variant: "success" })}
    ${renderKpiCard({ label: "Mensajes fallidos", value: dashValue(snap, snap?.failedLast24h ?? 0), hint: "Últimas 24 h", icon: "error", variant: "danger" })}
    ${renderKpiCard({ label: "Wallets activas", value: dashValue(snap, snap?.activeWallets ?? 0), hint: "Clientes reales", icon: "account_balance_wallet", variant: "default" })}
    ${renderKpiCard({ label: "Compras pendientes", value: dashValue(snap, snap?.pendingOrders ?? 0), hint: "Pago pendiente", icon: "shopping_cart", variant: "warn" })}
    ${renderKpiCard({ label: "Por acreditar", value: dashValue(snap, (snap?.paidPendingCredit ?? 0) + (snap?.paidPendingClaim ?? 0)), hint: "Pagadas sin crédito wallet", icon: "payments", variant: "warn" })}
    ${renderKpiCard({ label: "Saldo bajo", value: dashValue(snap, snap?.lowBalanceCompanies ?? 0), hint: "< 500 SMS disp.", icon: "warning", variant: "danger" })}
  </div>`;

  const chart = snap?.chart7Days ?? { labels: [], values: [] };
  const chartBlock =
    chart.labels.length > 0
      ? renderChartBars(chart.labels, chart.values)
      : `<p class="field-hint">Sin envíos SMS reales en los últimos 7 días.</p>`;

  const topClientRows =
    snap && snap.topClients.length > 0
      ? snap.topClients
          .map(
            (c) => `<tr>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${fmtN(c.consumed)}</td>
      <td>${fmtN(c.balance)}</td>
      <td>${escapeHtml(c.deliveryRate)}</td>
      <td>${statusBadgeSa("activo")}</td>
    </tr>`,
          )
          .join("")
      : `<tr><td colspan="5">Sin datos de consumo real aún.</td></tr>`;

  const alertItems =
    snap && snap.operationalAlerts.length > 0
      ? snap.operationalAlerts
          .map(
            (a) =>
              `<li class="tv-insight"><span class="material-symbols-outlined" aria-hidden="true">warning</span>${escapeHtml(a)}</li>`,
          )
          .join("")
      : `<li class="tv-insight"><span class="material-symbols-outlined" aria-hidden="true">info</span>Sin alertas operativas.</li>`;

  const campaignRows =
    snap && snap.recentCampaigns.length > 0
      ? snap.recentCampaigns
          .map(
            (c) => `<tr>
      <td>${escapeHtml(c.companyName)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${fmtN(c.sent)}</td>
      <td>${fmtN(c.delivered)}</td>
      <td>${statusBadgeSa(c.status)}</td>
      <td>${formatDate(c.createdAt)}</td>
      <td><a href="/admin/campaigns" class="row-link">Detalle</a></td>
    </tr>`,
          )
          .join("")
      : `<tr><td colspan="7">Sin campañas recientes de clientes reales.</td></tr>`;

  const quickActions = `<div class="tv-quick-grid">
    ${renderQuickAction({ href: "/admin/clients", label: "Clientes", description: "Cuentas y estados", icon: "business" })}
    ${renderQuickAction({ href: "/admin/orders", label: "Compras", description: "Validar y acreditar", icon: "shopping_cart" })}
    ${renderQuickAction({ href: "/admin/wallets", label: "Saldos", description: "Ajustes manuales", icon: "account_balance_wallet" })}
    ${renderQuickAction({ href: "/admin/providers", label: "Proveedores", description: "Salud upstream", icon: "hub" })}
    ${renderQuickAction({ href: "/admin/dlr", label: "DLR global", description: "Estados de entrega", icon: "mark_email_read" })}
    ${renderQuickAction({ href: "/admin/chat", label: "Soporte", description: "Tickets clientes", icon: "support_agent" })}
  </div>`;

  return `
    ${renderSuperadminBanner("Métricas operativas basadas en clientes producción real — sin datos mock.")}
    ${renderPageHeader({
      title: "Dashboard Superadmin",
      subtitle: `Operación global telvoice · ${options.admin.name}`,
    })}
    ${warningBlock}
    ${successBlock}
    ${renderClientPanelNotice()}
    ${kpiGrid}
    <div class="tv-dash-grid">
      <section class="tv-panel tv-panel--wide">
        ${renderSectionTitle("Tráfico SMS real", "Envíos panel live de clientes producción (últimos 7 días)")}
        <div class="tv-panel__body">${chartBlock}</div>
      </section>
      <section class="tv-panel">
        ${renderSectionTitle("Proveedores", "Métricas operativas")}
        <div class="tv-panel__body">
          <p class="field-hint">Sin datos operativos agregados de proveedores en este dashboard. Usa <a href="/admin/providers">Proveedores</a> o <a href="/admin/traffic-control">Control de tráfico</a> para métricas en vivo.</p>
        </div>
      </section>
    </div>
    <div class="tv-dash-grid tv-dash-grid--2">
      <section class="tv-panel">
        ${renderSectionTitle("Clientes con mayor consumo")}
        <div class="tv-panel__body table-wrap" style="padding:0">
          <table class="tv-table tv-table--compact">
            <thead><tr><th>Cliente</th><th>SMS consumidos</th><th>Saldo</th><th>Entrega</th><th>Estado</th></tr></thead>
            <tbody>${topClientRows}</tbody>
          </table>
        </div>
      </section>
      <section class="tv-panel">
        ${renderSectionTitle("Alertas operativas")}
        <div class="tv-panel__body">
          <ul class="tv-insights">${alertItems}</ul>
        </div>
      </section>
    </div>
    <div class="tv-dash-grid tv-dash-grid--2">
      <section class="tv-panel">
        ${renderSectionTitle("Accesos rápidos")}
        <div class="tv-panel__body tv-panel__body--flush">${quickActions}</div>
      </section>
      <section class="tv-panel">
        ${renderSectionTitle("Estado del sistema")}
        <div class="tv-panel__body">
          <dl class="tv-meta-list">
            <div><dt>Servicio</dt><dd>${options.serviceOk ? statusBadge("ok") : statusBadge("error")}</dd></div>
            <div><dt>Supabase</dt><dd>${options.supabaseConfigured ? statusBadge("active") : statusBadge("pending")}</dd></div>
            <div><dt>aSMSC</dt><dd>${escapeHtml(options.asmscBalance?.balanceAmount ?? options.asmscBalance?.error ?? "—")}</dd></div>
            <div><dt>Webhook DLR</dt><dd class="tv-meta-dd--truncate">${escapeHtml(options.dlrWebhookUrl ?? getConfiguredDlrWebhookUrl())}</dd></div>
          </dl>
        </div>
      </section>
    </div>
    <section class="tv-panel">
      ${renderSectionTitle("Campañas recientes", "Solo clientes producción real")}
      <div class="tv-panel__body table-wrap" style="padding:0">
        <table class="tv-table">
          <thead><tr><th>Cliente</th><th>Campaña</th><th>Destinatarios</th><th>Entregados</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
          <tbody>${campaignRows}</tbody>
        </table>
      </div>
    </section>`;
}
