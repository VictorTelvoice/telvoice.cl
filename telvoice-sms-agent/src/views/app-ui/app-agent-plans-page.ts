import {
  agentPlanRequestStatusMessage,
  agentPlanStatusLabel,
  preferredNumberTypeLabel,
} from "../../services/clientAgentPlanService.js";
import type {
  AgentPlanRequestRow,
  AgentPlanSubscriptionRow,
  ClientNumberListItem,
} from "../../types/client-numbers.js";
import {
  agentPlanDisplayName,
  parseSimSubscriptionPlanId,
} from "../../utils/agent-plan-intent.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import {
  buildPublicSimNumeracionUrl,
  getPublicSimSubscriptionCatalog,
  type PublicSimSubscriptionPlanId,
  type SimSubscriptionPlanCatalogEntry,
} from "../../utils/simPlans.js";
import { renderBtn, renderPageHeader, renderNotice } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtMoney, wrapAppPage } from "./app-page-wrap.js";

function renderPlanCard(
  plan: SimSubscriptionPlanCatalogEntry,
  options: {
    publicSiteUrl: string;
    selectedPlan?: PublicSimSubscriptionPlanId;
    hasActiveNumbers: boolean;
  },
): string {
  const isSelected = options.selectedPlan === plan.plan_id;
  const featuredClass = plan.featured ? " tv-agent-plan-card--featured" : "";
  const selectedClass = isSelected ? " tv-agent-plan-card--selected" : "";
  const checkoutUrl = buildPublicSimNumeracionUrl(
    plan.plan_id as PublicSimSubscriptionPlanId,
    options.publicSiteUrl,
  );

  return `<article class="tv-agent-plan-card${featuredClass}${selectedClass}">
    ${plan.featured ? '<span class="tv-agent-plan-card__ribbon">Popular</span>' : ""}
    ${isSelected ? '<span class="tv-agent-plan-card__badge">Seleccionado</span>' : ""}
    <header class="tv-agent-plan-card__head">
      <p class="tv-agent-plan-card__billing">Suscripción mensual</p>
      <h3>${escapeHtml(plan.sim_label)}</h3>
      <div class="tv-agent-plan-card__price">${escapeHtml(fmtMoney(plan.total_amount))}<span>/ mes</span></div>
      <p class="tv-agent-plan-card__price-note">Pago recurrente mensual.</p>
    </header>
    <p class="tv-agent-plan-card__desc">${escapeHtml(plan.description)}</p>
    <ul class="tv-agent-plan-card__features">
      ${plan.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
    </ul>
    ${
      options.hasActiveNumbers
        ? `<p class="tv-agent-plan-card__pending">Puedes contratar otra línea desde el checkout público.</p>`
        : ""
    }
    <div class="tv-agent-plan-card__cta">
      ${renderBtn(plan.ctaLabel, {
        href: checkoutUrl,
        variant: plan.featured || isSelected ? "primary" : "secondary",
        icon: "shopping_cart",
        target: "_blank",
        rel: "noopener noreferrer",
      })}
    </div>
  </article>`;
}

function renderCustomPlanCard(publicSiteUrl: string): string {
  const checkoutUrl = `${publicSiteUrl.replace(/\/$/, "")}/numeracion-sim.html?plan=custom`;
  return `<article class="tv-agent-plan-card tv-agent-plan-card--custom">
    <header class="tv-agent-plan-card__head">
      <p class="tv-agent-plan-card__billing tv-agent-plan-card__billing--custom">Contrato comercial</p>
      <h3>A medida</h3>
      <div class="tv-agent-plan-card__price tv-agent-plan-card__price--custom">Cotización personalizada</div>
      <p class="tv-agent-plan-card__price-note">Para múltiples números, volumen o integraciones especiales.</p>
    </header>
    <ul class="tv-agent-plan-card__features">
      <li>Múltiples números SIM reales</li>
      <li>Volumen SMS personalizado</li>
      <li>Automatizaciones e integraciones avanzadas</li>
      <li>Integración API/Webhooks</li>
      <li>Soporte operativo Telvoice</li>
      <li>Diseño de flujo a medida</li>
    </ul>
    <div class="tv-agent-plan-card__cta">
      ${renderBtn("Solicitar plan a medida", {
        href: checkoutUrl,
        variant: "secondary",
        icon: "support_agent",
        target: "_blank",
        rel: "noopener noreferrer",
      })}
    </div>
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
  return `<section class="tv-panel tv-agent-plan-status" style="margin-bottom:1rem">
    <header class="tv-section-head">
      <h2 class="tv-section-head__title">Plan contratado</h2>
      <span class="badge badge-ok">${escapeHtml(agentPlanStatusLabel(subscription.status))}</span>
    </header>
    <div class="tv-panel__body">
      <p><strong>${escapeHtml(agentPlanDisplayName(subscription.plan_code))}</strong> · ${escapeHtml(fmtMoney(subscription.monthly_price_clp))} / mes</p>
      ${subscription.renews_at ? `<p class="field-hint">Próxima renovación: ${formatDate(subscription.renews_at)}</p>` : ""}
    </div>
  </section>`;
}

function renderActiveNumbersPanel(numbers: ClientNumberListItem[]): string {
  const active = numbers.filter((n) =>
    ["active", "pending_activation", "reserved"].includes(n.status),
  );
  if (!active.length) return "";

  const rows = active
    .map(
      (n) =>
        `<li><strong>${escapeHtml(n.number)}</strong> · ${escapeHtml(n.plan_label || "—")} · ${escapeHtml(n.status === "active" ? "Activa" : n.status)}</li>`,
    )
    .join("");

  return `<section class="tv-panel tv-agent-plan-status" style="margin-bottom:1rem">
    <header class="tv-section-head">
      <h2 class="tv-section-head__title">Tus numeraciones</h2>
      ${renderBtn("Mis números", { href: "/app/numeraciones", variant: "secondary", size: "sm", icon: "sim_card" })}
    </header>
    <div class="tv-panel__body">
      <ul class="tv-agent-plan-numbers">${rows}</ul>
      <p class="field-hint">Puedes contratar otra línea eligiendo un plan abajo.</p>
    </div>
  </section>`;
}

export type AppAgentPlansPageData = {
  publicSiteUrl: string;
  activeNumbers: ClientNumberListItem[];
  activeSubscription: AgentPlanSubscriptionRow | null;
  selectedPlan?: PublicSimSubscriptionPlanId;
  showIntentBanner?: boolean;
  highlightRequest?: AgentPlanRequestRow | null;
};

export function renderAppAgentPlansPage(
  ctx: AppPageContext,
  data: AppAgentPlansPageData,
): string {
  const selectedPlan = data.selectedPlan;
  const hasActiveNumbers = data.activeNumbers.some((n) => n.status === "active");
  const catalog = getPublicSimSubscriptionCatalog();

  const intentBanner =
    data.showIntentBanner && selectedPlan
      ? renderNotice(
          `Seleccionaste ${catalog.find((p) => p.plan_id === selectedPlan)?.sim_label ?? selectedPlan}. Continúa en el checkout de numeración SIM.`,
          "info",
        )
      : "";

  const body = `
    ${renderPageHeader({
      title: "Planes de numeración SIM",
      subtitle:
        "Contrata una numeración SIM Telvoice con SMS incluidos y agente Telvoice.",
      actions: renderBtn("Mis números", {
        href: "/app/numeraciones",
        variant: "secondary",
        icon: "sim_card",
      }),
    })}
    ${intentBanner}
    ${ctx.flash ? renderNotice(ctx.flash, "info") : ""}
    ${ctx.error ? `<div class="alert alert-err">${escapeHtml(ctx.error)}</div>` : ""}
    ${renderActiveNumbersPanel(data.activeNumbers)}
    ${
      data.activeSubscription?.status === "active"
        ? renderActiveSubscriptionPanel(data.activeSubscription)
        : data.highlightRequest
          ? renderRequestStatusPanel(data.highlightRequest)
          : ""
    }
    <div class="tv-agent-plans-grid">
      ${catalog
        .map((p) =>
          renderPlanCard(p, {
            publicSiteUrl: data.publicSiteUrl,
            selectedPlan,
            hasActiveNumbers,
          }),
        )
        .join("")}
      ${renderCustomPlanCard(data.publicSiteUrl)}
    </div>
    <p class="tv-agent-plans-note">
      El checkout de numeración SIM usa suscripción mensual con inventario público y activación asistida.
      Las bolsas SMS para campañas masivas se compran aparte.
    </p>
    <style>
      .tv-agent-plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; }
      .tv-agent-plan-card { position: relative; background: var(--tv-panel-bg, rgba(255,255,255,0.04)); border-radius: 10px; padding: 1.25rem; display: flex; flex-direction: column; border: 1px solid transparent; }
      .tv-agent-plan-card--featured { border-color: rgba(59,130,246,0.25); }
      .tv-agent-plan-card--selected { border-color: rgba(59,130,246,0.45); box-shadow: 0 0 0 1px rgba(59,130,246,0.15); }
      .tv-agent-plan-card__ribbon { position: absolute; top: 0.75rem; left: 0.75rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(59,130,246,0.2); }
      .tv-agent-plan-card__badge { position: absolute; top: 0.75rem; right: 0.75rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(59,130,246,0.15); }
      .tv-agent-plan-card__billing { margin: 0 0 0.35rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.65; }
      .tv-agent-plan-card__billing--custom { opacity: 0.8; }
      .tv-agent-plan-card__head h3 { margin: 0 0 0.5rem; font-size: 1.35rem; }
      .tv-agent-plan-card__price { font-size: 1.5rem; font-weight: 700; }
      .tv-agent-plan-card__price span { font-size: 0.85rem; font-weight: 400; opacity: 0.7; }
      .tv-agent-plan-card__price--custom { font-size: 1.15rem; font-weight: 600; }
      .tv-agent-plan-card__price-note { margin: 0.25rem 0 0; font-size: 0.8rem; opacity: 0.65; }
      .tv-agent-plan-card__desc { margin: 0.75rem 0 0; font-size: 0.9rem; line-height: 1.5; opacity: 0.85; }
      .tv-agent-plan-card__features { flex: 1; margin: 1rem 0; padding-left: 1.25rem; font-size: 0.9rem; line-height: 1.6; }
      .tv-agent-plan-card__pending { font-size: 0.85rem; opacity: 0.8; margin: 0 0 0.75rem; }
      .tv-agent-plan-card__cta { margin-top: auto; display: flex; flex-direction: column; gap: 0.75rem; }
      .tv-agent-plans-note { margin-top: 1.5rem; font-size: 0.85rem; opacity: 0.7; max-width: 48rem; }
      .tv-agent-plan-status__meta { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; font-size: 0.9rem; margin-bottom: 0.75rem; }
      .tv-agent-plan-status__meta dt { opacity: 0.65; }
      .tv-agent-plan-status__message { margin: 0; line-height: 1.5; }
      .tv-agent-plan-numbers { margin: 0; padding-left: 1.25rem; line-height: 1.6; }
    </style>`;

  return wrapAppPage(ctx, "agent-plans", "Planes de numeración SIM", body);
}

export { parseSimSubscriptionPlanId };
