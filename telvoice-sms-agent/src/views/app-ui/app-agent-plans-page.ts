import { agentPlanStatusLabel } from "../../services/clientAgentPlanService.js";
import type { AgentPlanRequestRow } from "../../types/client-numbers.js";
import { AGENT_PLAN_DEFINITIONS } from "../../types/client-numbers.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { fmtMoney } from "./app-page-wrap.js";
import { renderBtn, renderPageHeader, renderNotice } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

function renderPlanCard(
  plan: (typeof AGENT_PLAN_DEFINITIONS)[number],
  hasPending: boolean,
): string {
  const ctaLabel =
    plan.code === "start"
      ? "Contratar Start"
      : plan.code === "pro"
        ? "Contratar Pro"
        : "Contratar Business";

  return `<article class="tv-agent-plan-card">
    <header class="tv-agent-plan-card__head">
      <h3>${escapeHtml(plan.name)}</h3>
      <div class="tv-agent-plan-card__price">${escapeHtml(fmtMoney(plan.priceClp))}<span>/ mes</span></div>
    </header>
    <ul class="tv-agent-plan-card__features">
      ${plan.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
    </ul>
    <form method="post" action="/app/planes-agente/request" class="tv-agent-plan-card__cta">
      <input type="hidden" name="plan_code" value="${escapeHtml(plan.code)}" />
      ${renderBtn(ctaLabel, {
        type: "submit",
        variant: "primary",
        disabled: hasPending,
        icon: "shopping_cart",
      })}
    </form>
  </article>`;
}

function renderPendingRequests(requests: AgentPlanRequestRow[]): string {
  if (!requests.length) return "";
  const rows = requests
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.plan_code.toUpperCase())}</td>
        <td>${escapeHtml(agentPlanStatusLabel(r.status))}</td>
        <td>${formatDate(r.created_at)}</td>
      </tr>`,
    )
    .join("");
  return `<section class="tv-panel" style="margin-bottom:1rem">
    <header class="tv-section-head"><h2 class="tv-section-head__title">Solicitudes en curso</h2></header>
    <table class="tv-table"><thead><tr><th>Plan</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

export type AppAgentPlansPageData = {
  pendingRequests: AgentPlanRequestRow[];
  showRequestSuccess?: boolean;
};

export function renderAppAgentPlansPage(
  ctx: AppPageContext,
  data: AppAgentPlansPageData,
): string {
  const hasPending = data.pendingRequests.some((r) =>
    ["pending", "reviewing", "approved"].includes(r.status),
  );

  const successAlert = data.showRequestSuccess
    ? renderNotice(
        "Solicitud recibida. Telvoice revisará disponibilidad de línea y activación comercial.",
        "info",
      )
    : ctx.flash
      ? renderNotice(ctx.flash, "info")
      : "";

  const body = `
    ${renderPageHeader({
      title: "Planes del agente",
      subtitle: "Contrata un plan con línea Telvoice incluida y agente comercial.",
      actions: renderBtn("Mis números", { href: "/app/numeraciones", variant: "secondary", icon: "sim_card" }),
    })}
    ${successAlert}
    ${ctx.error ? `<div class="alert alert-err">${escapeHtml(ctx.error)}</div>` : ""}
    ${renderPendingRequests(data.pendingRequests)}
    <div class="tv-agent-plans-grid">
      ${AGENT_PLAN_DEFINITIONS.map((p) => renderPlanCard(p, hasPending)).join("")}
    </div>
    <p class="tv-agent-plans-note">
      Las bolsas SMS para campañas masivas se compran aparte. Líneas adicionales, tráfico adicional
      e integraciones avanzadas pueden cotizarse según operación.
    </p>
    <style>
      .tv-agent-plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; }
      .tv-agent-plan-card { background: var(--tv-panel-bg, rgba(255,255,255,0.04)); border-radius: 10px; padding: 1.25rem; display: flex; flex-direction: column; }
      .tv-agent-plan-card__head h3 { margin: 0 0 0.5rem; }
      .tv-agent-plan-card__price { font-size: 1.5rem; font-weight: 700; }
      .tv-agent-plan-card__price span { font-size: 0.85rem; font-weight: 400; opacity: 0.7; }
      .tv-agent-plan-card__features { flex: 1; margin: 1rem 0; padding-left: 1.25rem; font-size: 0.9rem; line-height: 1.6; }
      .tv-agent-plan-card__cta { margin-top: auto; }
      .tv-agent-plans-note { margin-top: 1.5rem; font-size: 0.85rem; opacity: 0.7; max-width: 48rem; }
    </style>`;

  return wrapAppPage(ctx, "agent-plans", "Planes del agente", body);
}
