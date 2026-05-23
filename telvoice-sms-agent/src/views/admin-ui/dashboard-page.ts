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
  renderRouteStatusChile,
  renderSectionTitle,
} from "./components.js";

function countSmsToday(messages: SmsMessageRow[]): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return messages.filter((m) => new Date(m.created_at) >= start).length;
}

function deliveryRatePercent(stats: SmsMessageStats | null): string {
  if (!stats || stats.total <= 0) return "—";
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

function estimatedMonthlyCost(stats: SmsMessageStats | null): string {
  if (!stats) return "—";
  const unit = 7;
  const est = stats.total * unit * 1.19;
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(est);
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

  const clientName = options.testClient?.client.company_name ?? "Empresa";
  const smsAvailable = String(options.balance?.available_units ?? "—");
  const sentToday = String(countSmsToday(options.messages));
  const failed = options.stats ? String(options.stats.failed) : "—";
  const chart = chartFromMessages(options.messages);

  const kpiGrid = `<div class="tv-kpi-grid">
    ${renderKpiCard({ label: "SMS disponibles", value: smsAvailable, hint: "Saldo cliente prueba (CL)", icon: "sms", variant: "primary" })}
    ${renderKpiCard({ label: "SMS enviados hoy", value: sentToday, hint: "Según últimos registros cargados", icon: "today", variant: "default" })}
    ${renderKpiCard({ label: "Tasa de entrega", value: deliveryRatePercent(options.stats), hint: "Delivered / total histórico", icon: "check_circle", variant: "success" })}
    ${renderKpiCard({ label: "Mensajes fallidos", value: failed, hint: "Estado failed en plataforma", icon: "error", variant: "danger" })}
    ${renderKpiCard({ label: "Campañas activas", value: "—", hint: "Módulo campañas en preparación", icon: "campaign", variant: "default" })}
    ${renderKpiCard({ label: "Costo estimado del mes", value: estimatedMonthlyCost(options.stats), hint: "Referencial · tramo medio", icon: "payments", variant: "warn" })}
  </div>`;

  const quickActions = `<div class="tv-quick-grid">
    ${renderQuickAction({ href: "/admin/sms/send-test", label: "Enviar SMS", description: "Prueba unitaria o campaña", icon: "send" })}
    ${renderQuickAction({ href: "/admin/clients/test/credit", label: "Cargar saldo", description: "Abonar unidades al cliente", icon: "add_card" })}
    ${renderQuickAction({ href: "/admin/leads", label: "Ver contactos", description: "Leads comerciales", icon: "contacts" })}
    ${renderQuickAction({ href: "/admin/telegram/diagnostics", label: "Bot Telegram", description: "Diagnóstico y pruebas", icon: "smart_toy" })}
    ${renderQuickAction({ href: "/admin/asmsc/diagnostics", label: "API / aSMSC", description: "Balance y conectividad", icon: "api" })}
    ${renderQuickAction({ href: "/admin/settings", label: "Configuración", description: "Variables y webhook DLR", icon: "settings" })}
  </div>`;

  const campaignRows = options.messages.slice(0, 8).map(
    (m) => `<tr>
      <td><span class="tv-campaign-name">Envío ${escapeHtml(m.uid.slice(0, 8))}</span></td>
      <td>${statusBadge(m.status)}</td>
      <td>${escapeHtml(m.phonenumber)}</td>
      <td>1</td>
      <td>${formatDate(m.created_at)}</td>
      <td><a class="row-link" href="/admin/messages/${escapeHtml(m.id)}">Ver</a></td>
    </tr>`,
  );

  const routesOk = options.serviceOk && options.supabaseConfigured;
  const routeStatus = renderRouteStatusChile([
    { name: "Entel", status: routesOk ? "ok" : "warn" },
    { name: "Movistar", status: routesOk ? "ok" : "warn" },
    { name: "Claro", status: routesOk ? "ok" : "warn" },
    { name: "WOM", status: routesOk ? "ok" : "warn" },
  ]);

  return `
    <div class="tv-page-head">
      <div>
        <h1 class="tv-page-title">Dashboard</h1>
        <p class="tv-page-sub">Bienvenido, ${escapeHtml(options.admin.name)} · ${escapeHtml(clientName)}</p>
      </div>
    </div>
    ${warningBlock}
    ${successBlock}
    ${kpiGrid}
    <div class="tv-dash-grid">
      <section class="tv-panel tv-panel--wide">
        ${renderSectionTitle("Envíos por día", "Últimos 7 días según mensajes registrados")}
        <div class="tv-panel__body">
          ${renderChartBars(chart.labels, chart.values)}
        </div>
      </section>
      <section class="tv-panel">
        ${renderSectionTitle("Rutas Chile", options.serviceOk ? "Operación normal" : "Revisar conectividad")}
        <div class="tv-panel__body">
          ${routeStatus}
          <p class="tv-panel__foot">Cobertura SMS masivos Entel, Movistar, Claro y WOM.</p>
        </div>
      </section>
    </div>
    <div class="tv-dash-grid tv-dash-grid--2">
      <section class="tv-panel">
        ${renderSectionTitle("Accesos rápidos")}
        <div class="tv-panel__body tv-panel__body--flush">
          ${quickActions}
        </div>
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
    <section class="tv-panel" id="bandeja">
      ${renderSectionTitle("Actividad reciente", "Últimos envíos (vista tipo campaña)")}
      <div class="tv-panel__body table-wrap" style="padding:0">
        <table class="tv-table">
          <thead>
            <tr>
              <th>Referencia</th><th>Estado</th><th>Destino</th><th>Mensajes</th><th>Fecha</th><th></th>
            </tr>
          </thead>
          <tbody>${campaignRows.join("") || '<tr><td colspan="6">Sin envíos registrados.</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
}
