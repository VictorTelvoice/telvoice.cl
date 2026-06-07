import {
  agentPlanRequestStatusMessage,
  agentPlanStatusLabel,
  preferredNumberTypeLabel,
} from "../../services/clientAgentPlanService.js";
import type {
  AgentPlanCode,
  AgentPlanRequestRow,
  AgentPlanSubscriptionRow,
} from "../../types/client-numbers.js";
import { AGENT_PLAN_DEFINITIONS } from "../../types/client-numbers.js";
import { agentPlanDisplayName } from "../../utils/agent-plan-intent.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderPageHeader, renderNotice } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtMoney, wrapAppPage } from "./app-page-wrap.js";

function renderNumberTypeSelect(): string {
  return `<label class="tv-agent-plan-number-type">
    <span class="tv-agent-plan-number-type__label">Tipo de numeración preferida</span>
    <select name="preferred_number_type" class="tv-filter-input">
      <option value="either">Cualquiera según disponibilidad</option>
      <option value="sim_real">SIM real</option>
      <option value="fixed_line">Red fija</option>
    </select>
  </label>`;
}

function renderPlanCard(
  plan: (typeof AGENT_PLAN_DEFINITIONS)[number],
  options: {
    selectedPlan?: AgentPlanCode;
    activeSubscription: AgentPlanSubscriptionRow | null;
    requestForPlan?: AgentPlanRequestRow;
  },
): string {
  const isSelected = options.selectedPlan === plan.code;
  const hasActivePlan = options.activeSubscription?.status === "active";
  const pendingRequest = options.requestForPlan;
  const hasPending =
    !!pendingRequest &&
    ["pending", "reviewing", "approved"].includes(pendingRequest.status);

  const ctaLabel = isSelected
    ? "Confirmar solicitud"
    : plan.code === "start"
      ? "Contratar Start"
      : plan.code === "pro"
        ? "Contratar Pro"
        : "Contratar Business";

  const disabled = hasActivePlan || hasPending;
  const featuredClass = isSelected ? " tv-agent-plan-card--selected" : "";

  return `<article class="tv-agent-plan-card${featuredClass}">
    ${isSelected ? '<span class="tv-agent-plan-card__badge">Seleccionado</span>' : ""}
    <header class="tv-agent-plan-card__head">
      <h3>${escapeHtml(plan.name)}</h3>
      <div class="tv-agent-plan-card__price">${escapeHtml(fmtMoney(plan.priceClp))}<span>/ mes</span></div>
    </header>
    <ul class="tv-agent-plan-card__features">
      ${plan.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
    </ul>
    ${
      hasPending
        ? `<p class="tv-agent-plan-card__pending">Ya tienes una solicitud pendiente para este plan.</p>`
        : hasActivePlan
          ? `<p class="tv-agent-plan-card__pending">Ya tienes un plan agente activo.</p>`
          : ""
    }
    <form method="post" action="/app/planes-agente/request" class="tv-agent-plan-card__cta">
      <input type="hidden" name="plan_code" value="${escapeHtml(plan.code)}" />
      ${isSelected ? renderNumberTypeSelect() : ""}
      ${renderBtn(ctaLabel, {
        type: "submit",
        variant: isSelected ? "primary" : "secondary",
        disabled,
        icon: isSelected ? "check_circle" : "shopping_cart",
      })}
    </form>
  </article>`;
}

function renderRequestStatusPanel(request: AgentPlanRequestRow): string {
  const statusCls =
    request.status === "activated" || request.status === "approved"
      ? "ok"
      : request.status === "rejected"
        ? "err"
        : "warn";

  return `<section class="tv-panel tv-agent-plan-status" style="margin-bottom:1rem">
    <header class="tv-section-head">
      <h2 class="tv-section-head__title">Estado de tu solicitud</h2>
      <span class="badge badge-${statusCls}">${escapeHtml(agentPlanStatusLabel(request.status))}</span>
    </header>
    <div class="tv-panel__body">
      <dl class="tv-agent-plan-status__meta">
        <dt>Plan solicitado</dt><dd>${escapeHtml(agentPlanDisplayName(request.plan_code))}</dd>
        <dt>Estado</dt><dd>${escapeHtml(agentPlanStatusLabel(request.status))}</dd>
        <dt>Fecha</dt><dd>${formatDate(request.created_at)}</dd>
        <dt>Numeración preferida</dt><dd>${escapeHtml(preferredNumberTypeLabel(request.preferred_number_type))}</dd>
      </dl>
      <p class="tv-agent-plan-status__message">${escapeHtml(agentPlanRequestStatusMessage(request.status))}</p>
    </div>
  </section>`;
}

function renderActiveSubscriptionPanel(
  subscription: AgentPlanSubscriptionRow,
): string {
  const plan = AGENT_PLAN_DEFINITIONS.find((p) => p.code === subscription.plan_code);
  return `<section class="tv-panel tv-agent-plan-status" style="margin-bottom:1rem">
    <header class="tv-section-head">
      <h2 class="tv-section-head__title">Plan agente activo</h2>
      <span class="badge badge-ok">${escapeHtml(agentPlanStatusLabel(subscription.status))}</span>
    </header>
    <div class="tv-panel__body">
      <p><strong>${escapeHtml(plan?.name ?? subscription.plan_code)}</strong> · ${escapeHtml(fmtMoney(subscription.monthly_price_clp))} / mes</p>
      ${subscription.renews_at ? `<p class="field-hint">Próxima renovación: ${formatDate(subscription.renews_at)}</p>` : ""}
    </div>
  </section>`;
}

export type AppAgentPlansPageData = {
  pendingRequests: AgentPlanRequestRow[];
  activeSubscription: AgentPlanSubscriptionRow | null;
  selectedPlan?: AgentPlanCode;
  showIntentBanner?: boolean;
  showRequestSuccess?: boolean;
  highlightRequest?: AgentPlanRequestRow | null;
};

export function renderAppAgentPlansPage(
  ctx: AppPageContext,
  data: AppAgentPlansPageData,
): string {
  const selectedPlan = data.selectedPlan;
  const intentBanner =
    data.showIntentBanner && selectedPlan
      ? renderNotice(
          `Seleccionaste ${agentPlanDisplayName(selectedPlan)}. Revisa el detalle y confirma la solicitud.`,
          "info",
        )
      : "";

  const successAlert = data.showRequestSuccess
    ? renderNotice(
        "Solicitud recibida. Telvoice revisará disponibilidad de línea, tipo de numeración y activación comercial. Te notificaremos cuando el plan esté listo para operar.",
        "info",
      )
    : ctx.flash
      ? renderNotice(ctx.flash, "info")
      : "";

  const requestByPlan = new Map(
    data.pendingRequests.map((r) => [r.plan_code, r] as const),
  );

  const body = `
    ${renderPageHeader({
      title: "Planes del agente",
      subtitle: "Contrata un plan con línea Telvoice incluida y agente comercial.",
      actions: renderBtn("Mis números", { href: "/app/numeraciones", variant: "secondary", icon: "sim_card" }),
    })}
    ${intentBanner}
    ${successAlert}
    ${ctx.error ? `<div class="alert alert-err">${escapeHtml(ctx.error)}</div>` : ""}
    ${
      data.activeSubscription?.status === "active"
        ? renderActiveSubscriptionPanel(data.activeSubscription)
        : data.highlightRequest
          ? renderRequestStatusPanel(data.highlightRequest)
          : ""
    }
    <div class="tv-agent-plans-grid">
      ${AGENT_PLAN_DEFINITIONS.map((p) =>
        renderPlanCard(p, {
          selectedPlan,
          activeSubscription: data.activeSubscription,
          requestForPlan: requestByPlan.get(p.code),
        }),
      ).join("")}
    </div>
    <p class="tv-agent-plans-note">
      Las bolsas SMS para campañas masivas se compran aparte. Líneas adicionales, tráfico adicional
      e integraciones avanzadas pueden cotizarse según operación.
    </p>
    <style>
      .tv-agent-plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; }
      .tv-agent-plan-card { position: relative; background: var(--tv-panel-bg, rgba(255,255,255,0.04)); border-radius: 10px; padding: 1.25rem; display: flex; flex-direction: column; border: 1px solid transparent; }
      .tv-agent-plan-card--selected { border-color: rgba(59,130,246,0.45); box-shadow: 0 0 0 1px rgba(59,130,246,0.15); }
      .tv-agent-plan-card__badge { position: absolute; top: 0.75rem; right: 0.75rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(59,130,246,0.15); }
      .tv-agent-plan-card__head h3 { margin: 0 0 0.5rem; }
      .tv-agent-plan-card__price { font-size: 1.5rem; font-weight: 700; }
      .tv-agent-plan-card__price span { font-size: 0.85rem; font-weight: 400; opacity: 0.7; }
      .tv-agent-plan-card__features { flex: 1; margin: 1rem 0; padding-left: 1.25rem; font-size: 0.9rem; line-height: 1.6; }
      .tv-agent-plan-card__pending { font-size: 0.85rem; opacity: 0.8; margin: 0 0 0.75rem; }
      .tv-agent-plan-card__cta { margin-top: auto; display: flex; flex-direction: column; gap: 0.75rem; }
      .tv-agent-plan-number-type { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; }
      .tv-agent-plans-note { margin-top: 1.5rem; font-size: 0.85rem; opacity: 0.7; max-width: 48rem; }
      .tv-agent-plan-status__meta { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; font-size: 0.9rem; margin-bottom: 0.75rem; }
      .tv-agent-plan-status__meta dt { opacity: 0.65; }
      .tv-agent-plan-status__message { margin: 0; line-height: 1.5; }
    </style>`;

  return wrapAppPage(ctx, "agent-plans", "Planes del agente", body);
}
