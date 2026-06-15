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
      ${renderBtn("Ver planes de numeración", { href: "/app/planes-agente", variant: "secondary", size: "sm" })}
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
  const linkedNumber = numbers.find((n) => n.id === sub?.included_number_id);

  const pendingNotice =
    agent.pendingRequests.length > 0
      ? `<div class="alert tv-notice-block">
          Tienes ${agent.pendingRequests.length} solicitud(es) de plan en revisión.
          Telvoice revisará disponibilidad de línea y activación comercial.
        </div>`
      : "";

  const functions = [
    { label: "Campañas SMS asistidas", active: sub?.plan_code !== "start" },
    { label: "Recepción SMS", active: !!sub },
    { label: "Validaciones autorizadas", active: !!sub },
    { label: "Consulta de saldo", active: !!sub },
    { label: "Plantillas", active: !!sub },
    { label: "API/webhooks", active: sub?.plan_code === "business" },
    { label: "Telegram", active: sub?.plan_code === "pro" || sub?.plan_code === "business" },
  ];

  const functionsHtml = functions
    .map(
      (f) => `<div class="tv-agente-func${f.active ? " tv-agente-func--on" : ""}">
        <span class="material-symbols-outlined" aria-hidden="true">${f.active ? "toggle_on" : "toggle_off"}</span>
        ${escapeHtml(f.label)}
      </div>`,
    )
    .join("");

  const body = `
    ${renderPageHeader({
      title: "Agente Telvoice",
      subtitle: "Gestiona el agente asociado a tu empresa y su línea Telvoice.",
      actions: `
        ${renderBtn("Abrir chat del agente", { href: "/app/dashboard#agent", variant: "primary", icon: "smart_toy" })}
        ${renderBtn("Ver planes de numeración", { href: "/app/planes-agente", variant: "secondary" })}
      `,
    })}
    ${pendingNotice}
    ${!sub && latestRequest ? renderLatestRequestPanel(latestRequest) : ""}
    <div class="tv-agente-grid">
      <section class="tv-panel">
        <header class="tv-section-head"><h2 class="tv-section-head__title">Estado del agente</h2></header>
        <div class="tv-panel__body">
          <div class="tv-agente-kpis">
            <div class="tv-agente-kpi">
              <span class="tv-agente-kpi__label">Estado</span>
              ${renderAgentStatus(sub)}
            </div>
            <div class="tv-agente-kpi">
              <span class="tv-agente-kpi__label">Plan actual</span>
              <strong>${escapeHtml(planName)}</strong>
              ${sub ? `<small>${escapeHtml(planPrice)} / mes</small>` : ""}
            </div>
            <div class="tv-agente-kpi">
              <span class="tv-agente-kpi__label">Número asociado</span>
              <strong>${escapeHtml(linkedNumber?.number ?? "Sin asignar")}</strong>
            </div>
            ${sub?.renews_at ? `<div class="tv-agente-kpi"><span class="tv-agente-kpi__label">Próxima renovación</span><strong>${formatDate(sub.renews_at)}</strong></div>` : ""}
          </div>
        </div>
      </section>
      <section class="tv-panel">
        <header class="tv-section-head"><h2 class="tv-section-head__title">Funciones activas</h2></header>
        <div class="tv-panel__body tv-agente-funcs">${functionsHtml}</div>
      </section>
    </div>
    ${renderPanel(
      "Tu agente opera sobre una línea Telvoice",
      `<p>El Agente Telvoice puede ayudarte a gestionar campañas, revisar saldo, validar contactos y operar comunicaciones SMS asociadas a una numeración real o de red fija contratada por tu empresa.</p>
       <div class="tv-agente-quick">
         ${renderBtn("Ver numeración", { href: "/app/numeraciones", icon: "sim_card", variant: "secondary", size: "sm" })}
         ${renderBtn("Bandeja SMS", { href: "/app/sms-inbox", icon: "inbox", variant: "secondary", size: "sm" })}
         ${renderBtn("Configurar Telegram", { href: linkedNumber ? `/app/numeraciones/${encodeURIComponent(linkedNumber.id)}/integraciones` : "/app/numeraciones", icon: "send", variant: "secondary", size: "sm" })}
       </div>`,
    )}
    <style>
      .tv-agente-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
      @media (max-width: 800px) { .tv-agente-grid { grid-template-columns: 1fr; } }
      .tv-agente-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; }
      .tv-agente-kpi { display: flex; flex-direction: column; gap: 0.25rem; }
      .tv-agente-kpi__label { font-size: 0.8rem; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.04em; }
      .tv-agente-funcs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
      .tv-agente-func { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; opacity: 0.55; }
      .tv-agente-func--on { opacity: 1; }
      .tv-agente-quick { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem; }
    </style>`;

  return wrapAppPage(ctx, "agente", "Agente Telvoice", body);
}
