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
import type { PublicSimPlanCatalogItem } from "../../services/simPlanSettingsService.js";
import { escapeHtml, formatDate, embedJsonInScriptTag } from "../../utils/html.js";
import type { PublicSimSubscriptionPlanId } from "../../utils/simPlans.js";
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

function renderPlanCard(plan: PublicSimPlanCatalogItem): string {
  const cardClass = [
    "nsim-plan-card",
    plan.featured ? "is-featured" : "",
    plan.has_intro_promo ? "has-intro-promo" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ribbon = plan.ribbon
    ? `<span class="nsim-plan-ribbon">${escapeHtml(plan.ribbon)}</span>`
    : plan.featured
      ? `<span class="nsim-plan-ribbon">Popular</span>`
      : "";

  const discountLabel = Math.round(plan.annual_discount_percent);
  const promoBlock = plan.has_intro_promo
    ? `<p class="nsim-plan-price-before" data-nsim-price-before="${escapeHtml(plan.plan_id)}">Antes ${escapeHtml(fmtMoney(plan.regular_monthly_price_clp))} / mes</p>`
    : "";

  const ctaRegular =
    plan.plan_id === "sim_starter"
      ? "Suscribirme Starter"
      : plan.plan_id === "sim_pro"
        ? "Suscribirme Pro"
        : `Suscribirme ${plan.sim_label}`;

  return `<article class="${cardClass}" data-nsim-plan-card="${escapeHtml(plan.plan_id)}">
    ${ribbon}
    <span class="nsim-plan-billing-badge" data-nsim-billing-label="${escapeHtml(plan.plan_id)}">Suscripción mensual</span>
    <h3 class="nsim-plan-name">${escapeHtml(plan.sim_label)}</h3>
    ${promoBlock}
    <p class="nsim-plan-price" data-nsim-price="${escapeHtml(plan.plan_id)}"
      data-nsim-monthly="${plan.monthly_price_clp}"
      data-nsim-promo-monthly="${plan.has_intro_promo ? plan.promo_monthly_price_clp : plan.monthly_price_clp}"
      data-nsim-regular-monthly="${plan.regular_monthly_price_clp}"
      data-nsim-has-promo="${plan.has_intro_promo ? "1" : "0"}"
      data-nsim-promo-discount="${plan.has_intro_promo ? Math.round(plan.promo_discount_percent) : 0}"
      data-nsim-promo-months="${plan.has_intro_promo ? plan.promo_duration_months : 0}"
      data-nsim-annual-price="${plan.annual_price_clp}"
      data-nsim-annual-eq="${plan.monthly_equiv_annual_clp}"
      data-nsim-annual-discount="${discountLabel}"
      data-nsim-annual-enabled="${plan.annual_enabled ? "1" : "0"}">${escapeHtml(fmtMoney(plan.has_intro_promo ? plan.promo_monthly_price_clp : plan.total_amount))} <span>/ mes</span></p>
    <p class="nsim-plan-price-subnote" data-nsim-price-note="${escapeHtml(plan.plan_id)}">${plan.has_intro_promo ? escapeHtml(`${Math.round(plan.promo_discount_percent)}% de descuento por ${plan.promo_duration_months} meses. Luego ${fmtMoney(plan.regular_monthly_price_clp)} / mes.`) : "Pago recurrente mensual."}</p>
    <p class="nsim-plan-desc">${escapeHtml(plan.description)}</p>
    <ul class="nsim-plan-features">
      ${plan.features.map((f) => renderFeatureItem(f)).join("")}
    </ul>
    <button type="button" class="nsim-btn-primary nsim-plan-cta" data-tv-sim-plan-open="${escapeHtml(plan.plan_id)}" data-nsim-cta-promo="${escapeHtml(plan.ctaLabel)}" data-nsim-cta-regular="${escapeHtml(ctaRegular)}">${escapeHtml(plan.has_intro_promo ? plan.ctaLabel : ctaRegular)}</button>
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

function renderBillingSwitch(defaultDiscount: number): string {
  const discountLabel = Math.round(defaultDiscount);
  return `<div class="nsim-billing-card nsim-billing-card--switch-only" aria-label="Modalidad de pago">
    <div class="nsim-billing-switch" role="group" aria-label="Seleccionar modalidad de pago">
      <button type="button" class="nsim-billing-switch__button is-active" data-billing-cycle="monthly" aria-pressed="true">Mensual</button>
      <button type="button" class="nsim-billing-switch__button" data-billing-cycle="annual" aria-pressed="false">Anual <span data-nsim-switch-discount>-${discountLabel}%</span></button>
    </div>
  </div>`;
}

export function getAppSimPlansBillingScript(): string {
  return `(function () {
  var state = { billing: "monthly" };

  function fmtMoney(n) {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(n) || 0);
  }

  function annualTotalFromNode(node) {
    var annual = node.getAttribute("data-nsim-annual-price");
    if (annual) return Number(annual);
    var monthly = node.getAttribute("data-nsim-monthly");
    var discount = Number(node.getAttribute("data-nsim-annual-discount")) || 20;
    return Math.round(Number(monthly) * 12 * (1 - discount / 100));
  }

  function annualEqFromNode(node) {
    var eq = node.getAttribute("data-nsim-annual-eq");
    if (eq) return Number(eq);
    var monthly = node.getAttribute("data-nsim-monthly");
    var discount = Number(node.getAttribute("data-nsim-annual-discount")) || 20;
    return Math.round(Number(monthly) * (1 - discount / 100));
  }

  function discountFromNode(node) {
    return Number(node.getAttribute("data-nsim-annual-discount")) || 20;
  }

  function setBilling(billing) {
    state.billing = billing === "annual" ? "annual" : "monthly";
    document.documentElement.setAttribute("data-tv-sim-billing", state.billing);
    updatePricing();
    document.dispatchEvent(new CustomEvent("tv-sim-billing-change", { detail: { billing: state.billing } }));
  }

  function hasPromo(node) {
    return node.getAttribute("data-nsim-has-promo") === "1";
  }

  function promoMonthlyFromNode(node) {
    return Number(node.getAttribute("data-nsim-promo-monthly")) || Number(node.getAttribute("data-nsim-monthly"));
  }

  function regularMonthlyFromNode(node) {
    return Number(node.getAttribute("data-nsim-regular-monthly")) || Number(node.getAttribute("data-nsim-monthly"));
  }

  function updatePricing() {
    var switchDiscount = 20;
    document.querySelectorAll("[data-nsim-price]").forEach(function (node) {
      var annualEnabled = node.getAttribute("data-nsim-annual-enabled") !== "0";
      switchDiscount = discountFromNode(node);
      if (state.billing === "annual" && !annualEnabled) return;
      node.innerHTML =
        state.billing === "annual"
          ? fmtMoney(annualEqFromNode(node)) + " <span>/ mes eq.</span>"
          : hasPromo(node)
            ? fmtMoney(promoMonthlyFromNode(node)) + " <span>/ mes</span>"
            : fmtMoney(node.getAttribute("data-nsim-monthly")) + " <span>/ mes</span>";
    });

    document.querySelectorAll("[data-nsim-price-before]").forEach(function (node) {
      var planId = node.getAttribute("data-nsim-price-before");
      var priceNode = document.querySelector('[data-nsim-price="' + planId + '"]');
      if (!priceNode) return;
      node.style.display = state.billing === "monthly" && hasPromo(priceNode) ? "" : "none";
    });

    document.querySelectorAll(".nsim-plan-card .nsim-plan-cta").forEach(function (btn) {
      var planId = btn.getAttribute("data-tv-sim-plan-open");
      var priceNode = document.querySelector('[data-nsim-price="' + planId + '"]');
      if (!priceNode) return;
      var promoCta = btn.getAttribute("data-nsim-cta-promo") || "";
      var regularCta = btn.getAttribute("data-nsim-cta-regular") || promoCta;
      btn.textContent =
        state.billing === "monthly" && hasPromo(priceNode) ? promoCta : regularCta;
    });

    var switchDiscountEl = document.querySelector("[data-nsim-switch-discount]");
    if (switchDiscountEl) switchDiscountEl.textContent = "-" + Math.round(switchDiscount) + "%";

    document.querySelectorAll("[data-nsim-price-note]").forEach(function (node) {
      var planId = node.getAttribute("data-nsim-price-note");
      var monthlyNode = document.querySelector('[data-nsim-price="' + planId + '"]');
      if (!monthlyNode) return;
      var discount = discountFromNode(monthlyNode);
      var annualEnabled = monthlyNode.getAttribute("data-nsim-annual-enabled") !== "0";
      if (state.billing === "annual" && annualEnabled) {
        node.textContent =
          "Pago anual: " + fmtMoney(annualTotalFromNode(monthlyNode)) + "/año · " + discount + "% de descuento.";
      } else if (state.billing === "monthly" && hasPromo(monthlyNode)) {
        var promoDisc = monthlyNode.getAttribute("data-nsim-promo-discount");
        var promoMonths = monthlyNode.getAttribute("data-nsim-promo-months");
        node.textContent =
          promoDisc + "% de descuento por " + promoMonths + " meses. Luego " + fmtMoney(regularMonthlyFromNode(monthlyNode)) + " / mes.";
      } else {
        node.textContent = "Pago recurrente mensual.";
      }
    });

    document.querySelectorAll("[data-nsim-billing-label]").forEach(function (node) {
      var monthlyNode = document.querySelector('[data-nsim-price="' + node.getAttribute("data-nsim-billing-label") + '"]');
      if (!monthlyNode) return;
      var discount = discountFromNode(monthlyNode);
      var annualEnabled = monthlyNode.getAttribute("data-nsim-annual-enabled") !== "0";
      node.textContent =
        state.billing === "annual" && annualEnabled
          ? "Membresía anual -" + discount + "%"
          : "Suscripción mensual";
    });

    document.querySelectorAll("[data-billing-cycle]").forEach(function (button) {
      var active = button.getAttribute("data-billing-cycle") === state.billing;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function boot() {
    document.documentElement.setAttribute("data-tv-sim-billing", state.billing);
    updatePricing();
    document.querySelectorAll("[data-billing-cycle]").forEach(function (button) {
      button.addEventListener("click", function () {
        setBilling(button.getAttribute("data-billing-cycle"));
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();`;
}

function renderPlansSection(catalog: PublicSimPlanCatalogItem[]): string {
  const defaultDiscount =
    catalog.find((p) => p.plan_id === "sim_starter")?.annual_discount_percent ??
    catalog[0]?.annual_discount_percent ??
    20;

  return `<section class="nsim-section nsim-section--lead nsim-plans-hero" aria-labelledby="nsim-planes-title">
    <div class="nsim-section-inner">
      <div class="nsim-section-toolbar">
        ${renderBtn("Mis números", {
          href: "/app/numeraciones",
          variant: "secondary",
          size: "sm",
          icon: "sim_card",
        })}
      </div>
      <h1 id="nsim-planes-title" class="nsim-section-title nsim-section-title--lead">Numeración SIM real</h1>
      <p class="nsim-section-intro">Activa una numeración SIM para recibir SMS, validar procesos y comunicarte con clientes, agentes o equipos críticos.</p>
      ${renderBillingSwitch(defaultDiscount)}
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
  catalog: PublicSimPlanCatalogItem[];
};

export function renderAppAgentPlansPage(
  ctx: AppPageContext,
  data: AppAgentPlansPageData,
): string {
  const selectedPlan = data.selectedPlan;
  const hasActiveNumbers = data.activeNumbers.some((n) => n.status === "active");
  const catalog = data.catalog;

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
    <script>${getAppSimPlansBillingScript()}</script>
    <script>${getAppSimSubscriptionCheckoutScript()}</script>`;

  return wrapAppPage(ctx, "agent-plans", "Numeración SIM real", body, {
    bodyClass: "tv-app-client--agent-plans",
  });
}

export { parseSimSubscriptionPlanId };
