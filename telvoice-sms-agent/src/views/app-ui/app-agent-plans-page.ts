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
import { escapeHtml, formatDate, embedJsonInScriptTag } from "../../utils/html.js";
import {
  getPublicSimSubscriptionCatalog,
  type PublicSimSubscriptionPlanId,
  type SimSubscriptionPlanCatalogEntry,
} from "../../utils/simPlans.js";
import {
  getAppSimSubscriptionCheckoutScript,
  renderAppSimSubscriptionCheckoutModal,
} from "./app-sim-subscription-checkout-ui.js";
import { renderBtn, renderPageHeader, renderNotice } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtMoney, wrapAppPage } from "./app-page-wrap.js";

function renderFeatureItem(text: string): string {
  return `<li><span class="material-symbols-outlined" aria-hidden="true">check</span><span>${escapeHtml(text)}</span></li>`;
}

function renderPlanCard(
  plan: SimSubscriptionPlanCatalogEntry,
  options: {
    selectedPlan?: PublicSimSubscriptionPlanId;
    hasActiveNumbers: boolean;
  },
): string {
  const isSelected = options.selectedPlan === plan.plan_id;
  const cardClass = [
    "tv-sim-plan-card",
    plan.featured ? "tv-sim-plan-card--featured" : "",
    isSelected ? "tv-sim-plan-card--selected" : "",
  ]
    .filter(Boolean)
    .join("");

  const badges = plan.featured
    ? ""
    : `<span class="tv-sim-plan-card__billing-badge">Suscripción mensual</span>`;

  const ribbon = plan.featured
    ? `<span class="tv-sim-plan-card__ribbon">Popular</span><span class="tv-sim-plan-card__billing-badge">Suscripción mensual</span>`
    : "";

  const ctaClass =
    plan.featured || isSelected
      ? "tv-sim-plan-card__cta-btn tv-sim-plan-card__cta-btn--primary"
      : "tv-sim-plan-card__cta-btn tv-sim-plan-card__cta-btn--secondary";

  const ctaButton = `<button type="button" class="${ctaClass}" data-tv-sim-plan-open="${escapeHtml(plan.plan_id)}">
      <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">shopping_cart</span>${escapeHtml(plan.ctaLabel)}
    </button>`;

  return `<article class="${cardClass}">
    ${ribbon || badges}
    <h3 class="tv-sim-plan-card__title">${escapeHtml(plan.sim_label)}</h3>
    <p class="tv-sim-plan-card__price">${escapeHtml(fmtMoney(plan.total_amount))}<span> / mes</span></p>
    <p class="tv-sim-plan-card__price-note">Pago recurrente mensual.</p>
    <p class="tv-sim-plan-card__description">${escapeHtml(plan.description)}</p>
    <ul class="tv-sim-plan-card__features">
      ${plan.features.map((f) => renderFeatureItem(f)).join("")}
    </ul>
    ${
      options.hasActiveNumbers
        ? `<p class="tv-sim-plan-card__pending">Puedes contratar otra línea con el mismo flujo de checkout del panel.</p>`
        : ""
    }
    <div class="tv-sim-plan-card__cta">
      ${ctaButton}
    </div>
  </article>`;
}

function renderCustomPlanCard(): string {
  const features = [
    "Múltiples números SIM reales",
    "Volumen SMS personalizado",
    "Automatizaciones e integraciones avanzadas",
    "Integración API/Webhooks",
    "Soporte operativo Telvoice",
    "Diseño de flujo a medida",
  ];

  return `<article class="tv-sim-plan-card tv-sim-plan-card--custom">
    <span class="tv-sim-plan-card__billing-badge tv-sim-plan-card__billing-badge--custom">Contrato comercial</span>
    <h3 class="tv-sim-plan-card__title">A medida</h3>
    <p class="tv-sim-plan-card__price tv-sim-plan-card__price--custom">Cotización personalizada</p>
    <p class="tv-sim-plan-card__description">Para empresas que necesitan más volumen, múltiples números, integraciones especiales, flujos de respuesta o automatizaciones avanzadas.</p>
    <ul class="tv-sim-plan-card__features">
      ${features.map((f) => renderFeatureItem(f)).join("")}
    </ul>
    <div class="tv-sim-plan-card__cta">
      <a href="/app/support" class="tv-sim-plan-card__cta-btn tv-sim-plan-card__cta-btn--secondary">
        <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">support_agent</span>
        Solicitar plan a medida
      </a>
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

  return `<section class="tv-panel tv-agent-plan-status">
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
  return `<section class="tv-panel tv-agent-plan-status">
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

  return `<section class="tv-panel tv-agent-plan-status">
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
          `Seleccionaste ${catalog.find((p) => p.plan_id === selectedPlan)?.sim_label ?? selectedPlan}. Continúa con el checkout del panel.`,
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
    <section class="tv-sim-plans-page">
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
      <div class="tv-sim-plans-grid">
        ${catalog
          .map((p) =>
            renderPlanCard(p, {
              selectedPlan,
              hasActiveNumbers,
            }),
          )
          .join("")}
        ${renderCustomPlanCard()}
      </div>
      <aside class="tv-sim-plans-note" aria-label="Información de checkout">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <p>Contrata numeración SIM desde este panel con tus datos precargados. Las bolsas SMS para campañas masivas se compran aparte en Comprar SMS.</p>
      </aside>
    </section>
    ${renderAppSimSubscriptionCheckoutModal()}
    ${embedJsonInScriptTag("tv-sim-plan-catalog", catalog)}
    <script>${getAppSimSubscriptionCheckoutScript()}</script>`;

  return wrapAppPage(ctx, "agent-plans", "Planes de numeración SIM", body);
}

export { parseSimSubscriptionPlanId };
