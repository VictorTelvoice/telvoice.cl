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
import { renderBtn, renderNotice } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtMoney, wrapAppPage } from "./app-page-wrap.js";

const CUSTOM_PLAN_SUBNOTE =
  "Para múltiples números, volumen o integraciones especiales.";

const CUSTOM_PLAN_FEATURES = [
  "Múltiples números SIM reales",
  "Volumen SMS personalizado",
  "Automatizaciones e integraciones avanzadas",
  "Integración API/Webhooks",
  "Soporte operativo Telvoice",
  "Diseño de flujo a medida",
] as const;

function renderFeatureItem(text: string): string {
  return `<li><span class="material-symbols-outlined" aria-hidden="true">check</span>${escapeHtml(text)}</li>`;
}

function renderPlanCard(plan: SimSubscriptionPlanCatalogEntry): string {
  const cardClass = [
    "nsim-plan-card",
    plan.featured ? "is-featured" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ribbon = plan.featured
    ? `<span class="nsim-plan-ribbon">Popular</span>`
    : "";

  return `<article class="${cardClass}">
    ${ribbon}
    <span class="nsim-plan-billing-badge">Suscripción mensual</span>
    <h3 class="nsim-plan-name">${escapeHtml(plan.sim_label)}</h3>
    <p class="nsim-plan-price">${escapeHtml(fmtMoney(plan.total_amount))} <span>/ mes</span></p>
    <p class="nsim-plan-price-subnote">Pago recurrente mensual.</p>
    <p class="nsim-plan-desc">${escapeHtml(plan.description)}</p>
    <ul class="nsim-plan-features">
      ${plan.features.map((f) => renderFeatureItem(f)).join("")}
    </ul>
    <button type="button" class="nsim-btn-primary nsim-plan-cta" data-tv-sim-plan-open="${escapeHtml(plan.plan_id)}">${escapeHtml(plan.ctaLabel)}</button>
  </article>`;
}

function renderCustomPlanCard(): string {
  return `<article class="nsim-plan-card nsim-plan-card--custom">
    <span class="nsim-plan-billing-badge nsim-plan-billing-badge--custom">Contrato comercial</span>
    <h3 class="nsim-plan-name">A medida</h3>
    <p class="nsim-plan-price nsim-plan-price--custom">Cotización personalizada</p>
    <p class="nsim-plan-price-subnote">${escapeHtml(CUSTOM_PLAN_SUBNOTE)}</p>
    <ul class="nsim-plan-features">
      ${CUSTOM_PLAN_FEATURES.map((f) => renderFeatureItem(f)).join("")}
    </ul>
    <a href="/app/support" class="nsim-btn-secondary nsim-plan-cta">Solicitar plan a medida</a>
  </article>`;
}

function renderBillingSwitch(): string {
  return `<div class="nsim-billing-card nsim-billing-card--switch-only" aria-label="Modalidad de pago">
    <div class="nsim-billing-switch" role="group" aria-label="Seleccionar modalidad de pago">
      <button type="button" class="nsim-billing-switch__button is-active" aria-pressed="true">Mensual</button>
      <button type="button" class="nsim-billing-switch__button nsim-billing-switch__button--panel-only" aria-pressed="false" disabled title="Checkout mensual en el panel">Anual <span>-20%</span></button>
    </div>
  </div>`;
}

function renderPlansSection(catalog: SimSubscriptionPlanCatalogEntry[]): string {
  return `<section class="nsim-section nsim-section--lead" aria-labelledby="nsim-planes-title">
    <div class="nsim-section-inner">
      <div class="nsim-section-toolbar">
        ${renderBtn("Mis números", {
          href: "/app/numeraciones",
          variant: "secondary",
          size: "sm",
          icon: "sim_card",
        })}
      </div>
      <p class="nsim-eyebrow nsim-eyebrow--center">Número Mobile real</p>
      <h1 id="nsim-planes-title" class="nsim-section-title nsim-section-title--lead">Numeración SIM real</h1>
      <p class="nsim-section-intro">Activa una numeración SIM para recibir SMS, validar procesos y comunicarte con clientes, agentes o equipos críticos.</p>
      ${renderBillingSwitch()}
      <div class="nsim-plans-grid">
        ${catalog.map((p) => renderPlanCard(p)).join("")}
        ${renderCustomPlanCard()}
      </div>
    </div>
  </section>`;
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

  const extraLineNotice =
    hasActiveNumbers
      ? renderNotice(
          "Puedes contratar otra línea con el mismo flujo de checkout del panel.",
          "info",
        )
      : "";

  const body = `
    <section class="tv-sim-plans-page">
      <div class="nsim-panel-preface">
        ${intentBanner}
        ${ctx.flash ? renderNotice(ctx.flash, "info") : ""}
        ${ctx.error ? `<div class="alert alert-err">${escapeHtml(ctx.error)}</div>` : ""}
        ${extraLineNotice}
        ${renderActiveNumbersPanel(data.activeNumbers)}
        ${
          data.activeSubscription?.status === "active"
            ? renderActiveSubscriptionPanel(data.activeSubscription)
            : data.highlightRequest
              ? renderRequestStatusPanel(data.highlightRequest)
              : ""
        }
      </div>
      ${renderPlansSection(catalog)}
    </section>
    ${renderAppSimSubscriptionCheckoutModal()}
    ${embedJsonInScriptTag("tv-sim-plan-catalog", catalog)}
    <script>${getAppSimSubscriptionCheckoutScript()}</script>`;

  return wrapAppPage(ctx, "agent-plans", "Numeración SIM real", body);
}

export { parseSimSubscriptionPlanId };
