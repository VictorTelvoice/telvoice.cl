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

function renderFeatureItem(text: string): string {
  return `<li><span class="material-symbols-outlined" aria-hidden="true">check</span><span>${escapeHtml(text)}</span></li>`;
}

function renderPlanCard(
  plan: SimSubscriptionPlanCatalogEntry,
  options: {
    publicSiteUrl: string;
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
    .join(" ");
  const checkoutUrl = buildPublicSimNumeracionUrl(
    plan.plan_id as PublicSimSubscriptionPlanId,
    options.publicSiteUrl,
  );

  const badges = [
    '<span class="tv-sim-plan-card__badge">Suscripción mensual</span>',
    plan.featured
      ? '<span class="tv-sim-plan-card__badge tv-sim-plan-card__badge--popular">Popular</span>'
      : "",
    isSelected
      ? '<span class="tv-sim-plan-card__badge tv-sim-plan-card__badge--selected">Seleccionado</span>'
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<article class="${cardClass}">
    <div class="tv-sim-plan-card__badge-row">${badges}</div>
    <h3 class="tv-sim-plan-card__title">${escapeHtml(plan.sim_label)}</h3>
    <p class="tv-sim-plan-card__price">${escapeHtml(fmtMoney(plan.total_amount))}<span> / mes</span></p>
    <p class="tv-sim-plan-card__price-note">Pago recurrente mensual.</p>
    <p class="tv-sim-plan-card__description">${escapeHtml(plan.description)}</p>
    <ul class="tv-sim-plan-card__features">
      ${plan.features.map((f) => renderFeatureItem(f)).join("")}
    </ul>
    ${
      options.hasActiveNumbers
        ? `<p class="tv-sim-plan-card__pending">Puedes contratar otra línea desde el checkout público.</p>`
        : ""
    }
    <div class="tv-sim-plan-card__cta">
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
  const features = [
    "Múltiples números SIM reales",
    "Volumen SMS personalizado",
    "Automatizaciones e integraciones avanzadas",
    "Integración API/Webhooks",
    "Soporte operativo Telvoice",
    "Diseño de flujo a medida",
  ];

  return `<article class="tv-sim-plan-card tv-sim-plan-card--custom">
    <div class="tv-sim-plan-card__badge-row">
      <span class="tv-sim-plan-card__badge tv-sim-plan-card__badge--custom">Contrato comercial</span>
    </div>
    <h3 class="tv-sim-plan-card__title">A medida</h3>
    <p class="tv-sim-plan-card__price tv-sim-plan-card__price--custom">Cotización personalizada</p>
    <p class="tv-sim-plan-card__description">Para múltiples números, volumen o integraciones especiales.</p>
    <ul class="tv-sim-plan-card__features">
      ${features.map((f) => renderFeatureItem(f)).join("")}
    </ul>
    <div class="tv-sim-plan-card__cta">
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
              publicSiteUrl: data.publicSiteUrl,
              selectedPlan,
              hasActiveNumbers,
            }),
          )
          .join("")}
        ${renderCustomPlanCard(data.publicSiteUrl)}
      </div>
      <aside class="tv-sim-plans-note" aria-label="Información de checkout">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <p>El checkout de numeración SIM usa suscripción mensual con inventario público y activación asistida. Las bolsas SMS para campañas masivas se compran aparte.</p>
      </aside>
    </section>`;

  return wrapAppPage(ctx, "agent-plans", "Planes de numeración SIM", body);
}

export { parseSimSubscriptionPlanId };
