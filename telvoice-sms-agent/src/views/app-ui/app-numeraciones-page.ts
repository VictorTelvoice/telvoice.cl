import {
  clientNumberStatusLabel,
  clientNumberTypeLabel,
} from "../../services/clientNumberService.js";
import type {
  ClientNumberListItem,
  ClientNumbersModuleState,
  AgentPlanRequestRow,
} from "../../types/client-numbers.js";
import { agentPlanStatusLabel, getAgentPlanDefinition } from "../../services/clientAgentPlanService.js";
import type { SimActivationRequestRow } from "../../types/sim-activation.js";
import { simActivationStatusLabel } from "../../services/simActivationService.js";
import { env } from "../../config/env.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import {
  renderAgentModuleStyles,
  renderQaLabBadge,
} from "../shared/agent-module-styles.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

function renderStatusBadge(status: string): string {
  const clsMap: Record<string, string> = {
    active: "ok",
    pending_activation: "warn",
    reserved: "warn",
    available: "muted",
    suspended: "err",
    cancelled: "muted",
  };
  const labelMap: Record<string, string> = {
    pending_activation: "Requiere validación",
  };
  const cls = clsMap[status] ?? "muted";
  const label =
    labelMap[status] ?? clientNumberStatusLabel(status as ClientNumberListItem["status"]);
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

function renderCapabilities(caps: ClientNumberListItem["capabilities"]): string {
  const items: string[] = [];
  if (caps.receive_sms) items.push("Recibir SMS");
  if (caps.send_sms) items.push("Enviar SMS");
  if (caps.otp_authorized) items.push("OTP autorizado");
  if (caps.api_webhook) items.push("API/webhook");
  return items.length ? items.map((i) => escapeHtml(i)).join(" · ") : "—";
}

function renderPendingSimActivations(
  activations: SimActivationRequestRow[],
): string {
  if (!activations.length) return "";

  const cards = activations
    .map((a) => {
      const statusCls =
        a.activation_status === "paid_pending_activation" ? "warn" : "muted";
      return `<article class="tv-sim-pending-card tv-panel">
        <h3 class="tv-sim-pending-card__title">Numeración SIM real en activación</h3>
        <p class="tv-sim-pending-card__text">
          Tu pago fue recibido. Estamos revisando disponibilidad y configurando tu numeración.
          Te notificaremos cuando esté activa.
        </p>
        <dl class="tv-sim-pending-card__meta">
          <div><dt>Plan</dt><dd>${escapeHtml(a.plan_name)}</dd></div>
          <div><dt>SMS salientes incluidos</dt><dd>${escapeHtml(new Intl.NumberFormat("es-CL").format(a.included_sms_monthly))} / mes</dd></div>
          <div><dt>Estado</dt><dd><span class="badge badge-${statusCls}">${escapeHtml(simActivationStatusLabel(a.activation_status))}</span></dd></div>
          <div><dt>Fecha de compra</dt><dd>${formatDate(a.created_at)}</dd></div>
          <div><dt>Referencia</dt><dd>${escapeHtml(a.id.slice(0, 8).toUpperCase())}</dd></div>
        </dl>
      </article>`;
    })
    .join("");

  return cards;
}

function renderPendingAgentSetup(requests: AgentPlanRequestRow[]): string {
  const checkoutRequests = requests.filter((r) =>
    ["paid_pending_setup", "pending", "reviewing", "approved"].includes(r.status),
  );
  if (!checkoutRequests.length) return "";

  return checkoutRequests
    .map((r) => {
      const def = getAgentPlanDefinition(r.plan_code);
      const statusCls = r.status === "paid_pending_setup" ? "warn" : "muted";
      return `<article class="tv-sim-pending-card tv-panel">
        <h3 class="tv-sim-pending-card__title">Agente Telvoice en configuración</h3>
        <p class="tv-sim-pending-card__text">
          Tu pago fue recibido. Estamos configurando tu agente según el plan contratado.
        </p>
        <dl class="tv-sim-pending-card__meta">
          <div><dt>Plan agente</dt><dd>${escapeHtml(def?.name ?? r.plan_code)}</dd></div>
          <div><dt>Estado</dt><dd><span class="badge badge-${statusCls}">${escapeHtml(agentPlanStatusLabel(r.status))}</span></dd></div>
          <div><dt>Fecha</dt><dd>${formatDate(r.created_at)}</dd></div>
          <div><dt>Referencia</dt><dd>${escapeHtml(r.id.slice(0, 8).toUpperCase())}</dd></div>
        </dl>
      </article>`;
    })
    .join("");
}

function renderActivationSection(
  simActivations: SimActivationRequestRow[],
  agentRequests: AgentPlanRequestRow[],
): string {
  const simCards = renderPendingSimActivations(simActivations);
  const agentCards = renderPendingAgentSetup(agentRequests);
  if (!simCards && !agentCards) return "";

  return `<section class="tv-activation-section">
    <h2 class="tv-activation-section__title">Tu activación</h2>
    <div class="tv-sim-pending-list">${simCards}${agentCards}</div>
  </section>`;
}

function renderEmptyState(): string {
  const plansUrl = `${env.publicSiteUrl.replace(/\/$/, "")}/numeracion-sim.html`;
  return `<section class="tv-numeraciones-empty tv-panel">
    <div class="tv-numeraciones-empty__icon" aria-hidden="true">
      <span class="material-symbols-outlined">sim_card</span>
    </div>
    <h2 class="tv-numeraciones-empty__title">Aún no tienes una numeración activa</h2>
    <p class="tv-numeraciones-empty__text">
      Cuando Telvoice active tu número SIM real, aparecerá aquí junto a su estado, plan y herramientas de operación.
    </p>
    <div class="tv-numeraciones-empty__actions">
      ${renderBtn("Ver planes de numeración", { href: plansUrl, variant: "primary", icon: "sell" })}
      ${renderBtn("Bandeja SMS", { href: "/app/sms-inbox", variant: "secondary", icon: "inbox" })}
    </div>
  </section>`;
}

function renderNumbersTable(numbers: ClientNumberListItem[]): string {
  if (!numbers.length) return renderEmptyState();

  const rows = numbers
    .map((n) => {
      const detailHref = `/app/numeraciones/${encodeURIComponent(n.id)}/integraciones`;
      const actions = `
        ${renderBtn("Bandeja", { href: `/app/sms-inbox?number=${encodeURIComponent(n.id)}`, size: "sm", variant: "secondary", icon: "inbox" })}
        ${renderBtn("Configurar", { href: detailHref, size: "sm", variant: "ghost" })}
        ${renderBtn("Integraciones", { href: detailHref, size: "sm", variant: "ghost", icon: "hub" })}
        ${renderBtn("Detalle", { href: detailHref, size: "sm", variant: "ghost", icon: "visibility" })}
      `;
      return `<tr>
        <td><strong>${escapeHtml(n.number)}</strong>${renderQaLabBadge(n.provider)}</td>
        <td>${escapeHtml(clientNumberTypeLabel(n.type))}</td>
        <td>${renderStatusBadge(n.status)}</td>
        <td>${escapeHtml(n.plan_label)}</td>
        <td class="tv-numeraciones-caps">${renderCapabilities(n.capabilities)}</td>
        <td>${n.last_sms_at ? `${formatDate(n.last_sms_at)}${n.last_sms_from ? `<br><small>${escapeHtml(n.last_sms_from)}</small>` : ""}` : "—"}</td>
        <td class="tv-table-actions">${actions}</td>
      </tr>`;
    })
    .join("");

  return `<div class="tv-table-wrap">
    <table class="tv-table tv-numeraciones-table">
      <thead>
        <tr>
          <th>Número</th>
          <th>Tipo</th>
          <th>Estado</th>
          <th>Plan</th>
          <th>Capacidades</th>
          <th>Último SMS</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export type AppNumeracionesPageData = {
  module: ClientNumbersModuleState;
  numbers: ClientNumberListItem[];
  pendingSimActivations: SimActivationRequestRow[];
  pendingAgentRequests: AgentPlanRequestRow[];
};

export function renderAppNumeracionesPage(
  ctx: AppPageContext,
  data: AppNumeracionesPageData,
): string {
  const migrationNotice = data.module.migrationPending
    ? `<div class="alert alert-warn tv-notice-block">El módulo de numeraciones requiere aplicar la migración 054 en Supabase.</div>`
    : "";

  const body = `
    ${renderPageHeader({
      title: "Mis números",
      subtitle: "Numeraciones Telvoice de tu empresa: estado, capacidades y bandeja SMS.",
      actions: `
        ${renderBtn("Bandeja SMS", { href: "/app/sms-inbox", variant: "secondary", icon: "inbox" })}
        ${renderBtn("Solicitar numeración", { href: "/app/planes-agente?action=request", variant: "primary", icon: "add_call" })}
      `,
    })}
    ${migrationNotice}
    ${renderActivationSection(data.pendingSimActivations, data.pendingAgentRequests)}
    <section class="tv-panel">
      ${renderNumbersTable(data.numbers)}
    </section>
    <style>
      .tv-sim-pending-list { display: grid; gap: 1rem; margin-bottom: 1rem; }
      .tv-sim-pending-card__title { margin: 0 0 0.5rem; font-size: 1.1rem; }
      .tv-sim-pending-card__text { margin: 0 0 1rem; opacity: 0.9; line-height: 1.5; }
      .tv-sim-pending-card__meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin: 0; }
      .tv-sim-pending-card__meta dt { font-size: 0.75rem; opacity: 0.7; margin: 0; }
      .tv-sim-pending-card__meta dd { margin: 0.15rem 0 0; font-weight: 600; }
      .tv-activation-section__title { margin: 0 0 1rem; font-size: 1.15rem; }
    </style>
    ${renderAgentModuleStyles()}`;

  return wrapAppPage(ctx, "numeraciones", "Mis números", body);
}
