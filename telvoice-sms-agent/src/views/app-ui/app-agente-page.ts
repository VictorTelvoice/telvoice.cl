import {
  agentPlanRequestStatusMessage,
  agentPlanStatusLabel,
  preferredNumberTypeLabel,
} from "../../services/clientAgentPlanService.js";
import type { AgentDashboardData } from "../../services/clientAgentPlanService.js";
import type { AgentPlanRequestRow, ClientNumberListItem } from "../../types/client-numbers.js";
import { agentPlanDisplayName } from "../../utils/agent-plan-intent.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderPageHeader, renderPanel } from "../admin-ui/page-kit.js";
import {
  renderAgentModuleStyles,
  renderQaLabBadge,
} from "../shared/agent-module-styles.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtMoney, wrapAppPage } from "./app-page-wrap.js";

function renderLatestRequestPanel(request: AgentPlanRequestRow): string {
  const statusCls =
    request.status === "activated" || request.status === "approved"
      ? "ok"
      : request.status === "rejected"
        ? "err"
        : "warn";
  return `<section class="tv-panel" style="margin-bottom:1rem">
    <header class="tv-section-head">
      <h2 class="tv-section-head__title">Solicitud de plan</h2>
      <span class="badge badge-${statusCls}">${escapeHtml(agentPlanStatusLabel(request.status))}</span>
    </header>
    <div class="tv-panel__body">
      <p><strong>${escapeHtml(agentPlanDisplayName(request.plan_code))}</strong> · ${escapeHtml(preferredNumberTypeLabel(request.preferred_number_type))}</p>
      <p class="field-hint">Solicitado el ${formatDate(request.created_at)}</p>
      <p>${escapeHtml(agentPlanRequestStatusMessage(request.status))}</p>
      ${renderBtn("Ver planes", { href: "/app/planes-agente", variant: "secondary", size: "sm" })}
    </div>
  </section>`;
}

function renderAgentStatus(subscription: AgentDashboardData["subscription"]): string {
  if (!subscription) {
    return `<span class="badge badge-muted">Sin plan activo</span>`;
  }
  const cls =
    subscription.status === "active"
      ? "ok"
      : subscription.status === "pending"
        ? "warn"
        : "muted";
  return `<span class="badge badge-${cls}">${escapeHtml(agentPlanStatusLabel(subscription.status))}</span>`;
}

function renderHeroBanner(
  sub: AgentDashboardData["subscription"],
  linkedNumber: ClientNumberListItem | undefined,
): string {
  if (sub?.status === "active") {
    return `<section class="tv-agent-hero tv-agent-hero--active">
      <div class="tv-agent-hero__icon"><span class="material-symbols-outlined" aria-hidden="true">smart_toy</span></div>
      <div>
        <h2 class="tv-agent-hero__title">Agente Telvoice activo</h2>
        <p class="tv-agent-hero__text">
          Tu agente está asociado a una numeración Telvoice y puede ayudarte a operar campañas,
          recibir SMS, revisar mensajes y gestionar comunicaciones empresariales.
        </p>
        <div class="tv-agent-hero__meta">
          ${renderAgentStatus(sub)}
          <span class="badge badge-muted">${escapeHtml(agentPlanDisplayName(sub.plan_code))}</span>
          ${linkedNumber ? `<span class="badge badge-muted">${escapeHtml(linkedNumber.number)}${renderQaLabBadge(linkedNumber.provider)}</span>` : ""}
        </div>
      </div>
    </section>`;
  }

  return `<section class="tv-agent-empty">
    <div class="tv-agent-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">smart_toy</span></div>
    <h2 class="tv-agent-empty__title">Aún no tienes un Agente Telvoice activo</h2>
    <p class="tv-agent-empty__text">
      Contrata un plan con línea incluida para operar campañas, recibir SMS y gestionar
      comunicaciones desde una numeración propia.
    </p>
    <div class="tv-agent-empty__actions">
      ${renderBtn("Ver planes del agente", { href: "/app/planes-agente", variant: "primary", icon: "workspace_premium" })}
      ${renderBtn("Mis numeraciones", { href: "/app/numeraciones", variant: "secondary", icon: "sim_card" })}
    </div>
  </section>`;
}

function renderRecentSms(numbers: ClientNumberListItem[]): string {
  const withSms = numbers
    .filter((n) => n.last_sms_at)
    .sort((a, b) => (b.last_sms_at ?? "").localeCompare(a.last_sms_at ?? ""))
    .slice(0, 5);
  if (!withSms.length) {
    return `<p class="field-hint">Aún no hay SMS recibidos en tus numeraciones.</p>`;
  }
  const items = withSms
    .map(
      (n) => `<li class="tv-recent-sms-item">
        <div>
          <strong>${escapeHtml(n.last_sms_from ?? "Remitente desconocido")}</strong>
          <div class="field-hint">${escapeHtml(n.number)}</div>
        </div>
        <small>${formatDate(n.last_sms_at!)}</small>
      </li>`,
    )
    .join("");
  return `<ul class="tv-recent-sms-list">${items}</ul>
    ${renderBtn("Ver bandeja completa", { href: "/app/sms-inbox", size: "sm", variant: "ghost", icon: "inbox" })}`;
}

function renderQuickAccess(linkedNumber: ClientNumberListItem | undefined): string {
  const numId = linkedNumber?.id;
  const integrationsHref = numId
    ? `/app/numeraciones/${encodeURIComponent(numId)}/integraciones`
    : "/app/numeraciones";
  const inboxHref = numId
    ? `/app/sms-inbox?number=${encodeURIComponent(numId)}`
    : "/app/sms-inbox";

  return `<div class="tv-agent-quick-grid">
    <a href="/app/numeraciones" class="tv-agent-quick-card">
      <span class="material-symbols-outlined" aria-hidden="true">sim_card</span>
      <strong>Ver numeración</strong>
      <span>Líneas y estado</span>
    </a>
    <a href="${escapeHtml(inboxHref)}" class="tv-agent-quick-card">
      <span class="material-symbols-outlined" aria-hidden="true">inbox</span>
      <strong>Bandeja SMS</strong>
      <span>Mensajes entrantes</span>
    </a>
    <a href="/app/planes-agente" class="tv-agent-quick-card">
      <span class="material-symbols-outlined" aria-hidden="true">workspace_premium</span>
      <strong>Ver planes</strong>
      <span>Plan y renovación</span>
    </a>
    <a href="${escapeHtml(integrationsHref)}" class="tv-agent-quick-card">
      <span class="material-symbols-outlined" aria-hidden="true">hub</span>
      <strong>Integraciones</strong>
      <span>Telegram y webhooks</span>
    </a>
  </div>`;
}

export type AppAgentePageData = {
  agent: AgentDashboardData;
  numbers: ClientNumberListItem[];
};

export function renderAppAgentePage(
  ctx: AppPageContext,
  data: AppAgentePageData,
): string {
  const { agent, numbers } = data;
  const sub = agent.subscription;
  const planName = agent.planDefinition?.name ?? "Sin plan";
  const planPrice = sub ? fmtMoney(sub.monthly_price_clp) : "—";
  const latestRequest = agent.pendingRequests[0] ?? null;
  const linkedNumber = numbers.find((n) => n.id === sub?.included_number_id) ?? numbers[0];

  const pendingNotice =
    agent.pendingRequests.length > 0
      ? `<div class="alert tv-notice-block">
          Tienes ${agent.pendingRequests.length} solicitud(es) de plan en revisión.
          Telvoice revisará disponibilidad de línea y activación comercial.
        </div>`
      : "";

  const functions = [
    { label: "Campañas SMS asistidas", active: sub?.plan_code !== "start" && !!sub },
    { label: "Recepción SMS", active: !!sub },
    { label: "Validaciones autorizadas", active: !!sub },
    { label: "Consulta de saldo", active: !!sub },
    { label: "Plantillas", active: !!sub },
    { label: "API/webhooks", active: sub?.plan_code === "business" },
    { label: "Telegram", active: sub?.plan_code === "pro" || sub?.plan_code === "business" },
  ];

  const functionsHtml = functions
    .map(
      (f) => `<div class="tv-agent-func${f.active ? " tv-agent-func--on" : ""}">
        <span class="material-symbols-outlined" aria-hidden="true">${f.active ? "check_circle" : "radio_button_unchecked"}</span>
        ${escapeHtml(f.label)}
      </div>`,
    )
    .join("");

  const activeBody = sub?.status === "active"
    ? `<div class="tv-agent-grid">
        <section class="tv-panel">
          <header class="tv-section-head"><h2 class="tv-section-head__title">Plan y servicio</h2></header>
          <div class="tv-panel__body">
            <div class="tv-agent-kpi-grid">
              <div class="tv-agent-kpi">
                <span class="tv-agent-kpi__label">Plan actual</span>
                <strong>${escapeHtml(planName)}</strong>
                <small>${escapeHtml(planPrice)} / mes</small>
              </div>
              <div class="tv-agent-kpi">
                <span class="tv-agent-kpi__label">Estado de servicio</span>
                ${renderAgentStatus(sub)}
              </div>
              <div class="tv-agent-kpi">
                <span class="tv-agent-kpi__label">Número asociado</span>
                <strong>${escapeHtml(linkedNumber?.number ?? "Sin asignar")}</strong>
                ${linkedNumber ? renderQaLabBadge(linkedNumber.provider) : ""}
              </div>
              ${sub.renews_at ? `<div class="tv-agent-kpi"><span class="tv-agent-kpi__label">Próxima renovación</span><strong>${formatDate(sub.renews_at)}</strong></div>` : ""}
            </div>
          </div>
        </section>
        <section class="tv-panel">
          <header class="tv-section-head"><h2 class="tv-section-head__title">Funciones activas</h2></header>
          <div class="tv-panel__body tv-agent-funcs">${functionsHtml}</div>
        </section>
      </div>
      <section class="tv-panel" style="margin-bottom:1rem">
        <header class="tv-section-head"><h2 class="tv-section-head__title">Últimos SMS recibidos</h2></header>
        <div class="tv-panel__body">${renderRecentSms(numbers)}</div>
      </section>`
    : "";

  const body = `
    ${renderPageHeader({
      title: "Agente Telvoice",
      subtitle: "Centro de operación del agente comercial y la numeración asociada.",
      actions: `
        ${renderBtn("Abrir chat del agente", { href: "/app/dashboard#agent", variant: "primary", icon: "smart_toy" })}
        ${renderBtn("Bandeja SMS", { href: "/app/sms-inbox", variant: "secondary", icon: "inbox" })}
      `,
    })}
    ${pendingNotice}
    ${renderHeroBanner(sub, linkedNumber)}
    ${!sub && latestRequest ? renderLatestRequestPanel(latestRequest) : ""}
    ${activeBody}
    ${renderPanel(
      "Accesos rápidos",
      `<p class="field-hint" style="margin:0 0 0.5rem">Opera tu línea Telvoice, revisa mensajes entrantes y configura integraciones.</p>
       ${renderQuickAccess(linkedNumber)}`,
    )}
    ${renderAgentModuleStyles()}`;

  return wrapAppPage(ctx, "agente", "Agente Telvoice", body);
}
