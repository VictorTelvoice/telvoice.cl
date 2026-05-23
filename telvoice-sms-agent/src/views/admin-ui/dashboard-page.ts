import type { AdminSessionUser } from "../../types/admin.js";
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
import {
  MOCK_SA_ALERTS,
  MOCK_SA_CAMPAIGNS,
  MOCK_SA_PROVIDERS,
  MOCK_SA_TOP_CLIENTS,
} from "./mock-data-superadmin.js";
import { renderMiniChart } from "./page-kit.js";
import {
  renderClientPanelNotice,
  renderSuperadminBanner,
  statusBadgeSa,
} from "./superadmin-kit.js";

function countSmsToday(messages: SmsMessageRow[]): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return messages.filter((m) => new Date(m.created_at) >= start).length;
}

function deliveryRatePercent(stats: SmsMessageStats | null, fallback = "94,4%"): string {
  if (!stats || stats.total <= 0) return fallback;
  const rate = (stats.delivered / stats.total) * 100;
  return `${rate.toFixed(1)}%`;
}

function chartFromMessages(messages: SmsMessageRow[]): {
  labels: string[];
  values: number[];
} {
  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setDate(end.getDate() + 1);
    const label = d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric" });
    const count = messages.filter((m) => {
      const t = new Date(m.created_at);
      return t >= d && t < end;
    }).length;
    days.push({ label, count });
  }
  return {
    labels: days.map((d) => d.label),
    values: days.map((d) => d.count),
  };
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
}): string {
  const warningBlock = options.configWarning
    ? `<div class="alert alert-error">${escapeHtml(options.configWarning)}</div>`
    : "";
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";

  const sentTodayReal = countSmsToday(options.messages);
  const sentToday = sentTodayReal > 0 ? String(sentTodayReal) : "12.840";
  const failed = options.stats?.failed
    ? String(options.stats.failed)
    : "223";
  const chart =
    options.messages.length > 0
      ? chartFromMessages(options.messages)
      : {
          labels: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
          values: [4200, 5100, 4800, 6200, 5840, 2100, 3900],
        };

  const kpiGrid = `<div class="tv-kpi-grid tv-kpi-grid--dense">
    ${renderKpiCard({ label: "Clientes activos", value: "38", hint: "Cuentas operativas", icon: "business", variant: "primary" })}
    ${renderKpiCard({ label: "SMS enviados hoy", value: sentToday, hint: "Tráfico global", icon: "today", variant: "default" })}
    ${renderKpiCard({ label: "SMS enviados (mes)", value: "284.500", hint: "Acumulado mayo", icon: "calendar_month", variant: "default" })}
    ${renderKpiCard({ label: "Saldo total vendido", value: "1,2M", hint: "Unidades acreditadas", icon: "sell", variant: "primary" })}
    ${renderKpiCard({ label: "Saldo consumido", value: "892K", hint: "Débitos por envío", icon: "trending_down", variant: "warn" })}
    ${renderKpiCard({ label: "Campañas activas", value: "24", hint: "Todos los clientes", icon: "campaign", variant: "default" })}
    ${renderKpiCard({ label: "Tasa entrega global", value: deliveryRatePercent(options.stats), hint: "DLR agregado", icon: "check_circle", variant: "success" })}
    ${renderKpiCard({ label: "Mensajes fallidos", value: failed, hint: "Últimas 24h ref.", icon: "error", variant: "danger" })}
    ${renderKpiCard({ label: "Proveedores activos", value: "3", hint: "Con tráfico", icon: "hub", variant: "default" })}
    ${renderKpiCard({ label: "Margen estimado", value: "38,2%", hint: "Venta vs costo", icon: "percent", variant: "success" })}
    ${renderKpiCard({ label: "Compras pendientes", value: "4", hint: "Validación pago", icon: "shopping_cart", variant: "warn" })}
    ${renderKpiCard({ label: "Tickets abiertos", value: "7", hint: "Soporte", icon: "support_agent", variant: "default" })}
  </div>`;

  const providerRows = MOCK_SA_PROVIDERS.map(
    (p) => `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.route)}</td>
      <td>${statusBadgeSa(p.status)}</td>
      <td>${escapeHtml(p.delivery)}</td>
      <td>${escapeHtml(p.latency)}</td>
      <td><a href="/admin/providers" class="row-link">Ver</a></td>
    </tr>`,
  ).join("");

  const topClientRows = MOCK_SA_TOP_CLIENTS.map(
    (c) => `<tr>
      <td><strong>${escapeHtml(c.client)}</strong></td>
      <td>${escapeHtml(c.consumed)}</td>
      <td>${escapeHtml(c.balance)}</td>
      <td>${escapeHtml(c.rate)}</td>
      <td>${statusBadgeSa(c.status)}</td>
    </tr>`,
  ).join("");

  const alertItems = MOCK_SA_ALERTS.map(
    (a) => `<li class="tv-insight"><span class="material-symbols-outlined" aria-hidden="true">warning</span>${escapeHtml(a)}</li>`,
  ).join("");

  const campaignRows = MOCK_SA_CAMPAIGNS.map(
    (c) => `<tr>
      <td>${escapeHtml(c.client)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(String(c.sent))}</td>
      <td>${escapeHtml(String(c.delivered))}</td>
      <td>${statusBadgeSa(c.status)}</td>
      <td>${escapeHtml(c.date)}</td>
      <td><a href="/admin/campaigns" class="row-link">Detalle</a></td>
    </tr>`,
  ).join("");

  const quickActions = `<div class="tv-quick-grid">
    ${renderQuickAction({ href: "/admin/clients", label: "Clientes", description: "Cuentas y estados", icon: "business" })}
    ${renderQuickAction({ href: "/admin/orders", label: "Compras", description: "Validar y acreditar", icon: "shopping_cart" })}
    ${renderQuickAction({ href: "/admin/wallets", label: "Saldos", description: "Ajustes manuales", icon: "account_balance_wallet" })}
    ${renderQuickAction({ href: "/admin/providers", label: "Proveedores", description: "Salud upstream", icon: "hub" })}
    ${renderQuickAction({ href: "/admin/dlr", label: "DLR global", description: "Estados de entrega", icon: "mark_email_read" })}
    ${renderQuickAction({ href: "/admin/chat", label: "Soporte", description: "Tickets clientes", icon: "support_agent" })}
  </div>`;

  const routesOk = options.serviceOk && options.supabaseConfigured;
  const recentReal = options.messages.slice(0, 5).map(
    (m) => `<tr>
      <td>${escapeHtml(options.testClient?.client.company_name ?? "Cliente prueba")}</td>
      <td>Envío ${escapeHtml(m.uid.slice(0, 8))}</td>
      <td>${statusBadge(m.status)}</td>
      <td>${escapeHtml(m.phonenumber)}</td>
      <td>${formatDate(m.created_at)}</td>
      <td><a class="row-link" href="/admin/messages/${escapeHtml(m.id)}">Ver</a></td>
    </tr>`,
  );

  return `
    ${renderSuperadminBanner()}
  <div class="tv-page-head">
      <div>
        <h1 class="tv-page-title">Dashboard Superadmin</h1>
        <p class="tv-page-sub">Operación global Telvoice · ${escapeHtml(options.admin.name)}</p>
      </div>
    </div>
    ${warningBlock}
    ${successBlock}
    ${renderClientPanelNotice()}
    ${kpiGrid}
    <div class="tv-dash-grid">
      <section class="tv-panel tv-panel--wide">
        ${renderSectionTitle("Tráfico SMS global", "Envíos por día y consumo mensual (referencial)")}
        <div class="tv-panel__body">
          ${renderChartBars(chart.labels, chart.values)}
          <div class="tv-charts-grid tv-charts-grid--inline">
            ${renderMiniChart("Consumo mensual", ["Sem 1", "Sem 2", "Sem 3", "Sem 4"], [62, 78, 71, 84], "primary")}
          </div>
        </div>
      </section>
      <section class="tv-panel">
        ${renderSectionTitle("Estado de proveedores", routesOk ? "Red operativa" : "Revisar conectividad")}
        <div class="tv-panel__body table-wrap" style="padding:0">
          <table class="tv-table tv-table--compact">
            <thead><tr><th>Proveedor</th><th>Ruta</th><th>Estado</th><th>Entrega</th><th>Latencia</th><th></th></tr></thead>
            <tbody>${providerRows}</tbody>
          </table>
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
      ${renderSectionTitle("Campañas recientes", "Todos los clientes")}
      <div class="tv-panel__body table-wrap" style="padding:0">
        <table class="tv-table">
          <thead><tr><th>Cliente</th><th>Campaña</th><th>Enviados</th><th>Entregados</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
          <tbody>${campaignRows}</tbody>
        </table>
      </div>
    </section>
    ${
      recentReal.length
        ? `<section class="tv-panel">
      ${renderSectionTitle("Envíos reales (cliente prueba)", "Datos desde Supabase")}
      <div class="tv-panel__body table-wrap" style="padding:0">
        <table class="tv-table">
          <thead><tr><th>Cliente</th><th>Ref.</th><th>Estado</th><th>Destino</th><th>Fecha</th><th></th></tr></thead>
          <tbody>${recentReal.join("")}</tbody>
        </table>
      </div>
    </section>`
        : ""
    }`;
}
