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
import { renderQaLabBadge } from "../shared/agent-module-styles.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

function numeracionesPageStyles(): string {
  return `<style>
    .tv-num-page .tv-num-card {
      background: #fff;
      border: 1px solid var(--tv-border, rgba(15, 23, 42, 0.1));
      border-radius: var(--tv-radius, 12px);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
      padding: 1.25rem 1.35rem;
    }
    .tv-num-page .tv-num-section { margin-bottom: 1.25rem; }
    .tv-num-page .tv-num-section__title {
      margin: 0 0 0.75rem;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .tv-num-page .tv-num-empty {
      display: grid;
      gap: 0.85rem;
      max-width: 42rem;
    }
    .tv-num-page .tv-num-empty__title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
    }
    .tv-num-page .tv-num-empty__text {
      margin: 0;
      line-height: 1.55;
      color: var(--tv-muted, #64748b);
      font-size: 0.92rem;
    }
    .tv-num-page .tv-num-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.75rem;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.12);
      border: 1px solid rgba(148, 163, 184, 0.25);
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--tv-text, #0f172a);
    }
    .tv-num-page .tv-num-empty__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      margin-top: 0.25rem;
    }
    .tv-num-page .tv-num-activation-grid {
      display: grid;
      gap: 0.85rem;
    }
    .tv-num-page .tv-num-activation-card__title {
      margin: 0 0 0.45rem;
      font-size: 0.98rem;
      font-weight: 700;
    }
    .tv-num-page .tv-num-activation-card__text {
      margin: 0 0 0.85rem;
      font-size: 0.88rem;
      line-height: 1.5;
      color: var(--tv-muted, #64748b);
    }
    .tv-num-page .tv-num-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.65rem 1rem;
      margin: 0;
    }
    .tv-num-page .tv-num-meta dt {
      margin: 0;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--tv-muted, #64748b);
    }
    .tv-num-page .tv-num-meta dd {
      margin: 0.15rem 0 0;
      font-size: 0.88rem;
      font-weight: 600;
    }
    .tv-num-page .tv-num-active-grid {
      display: grid;
      gap: 0.85rem;
    }
    .tv-num-page .tv-num-active-card__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.65rem;
      margin-bottom: 0.75rem;
    }
    .tv-num-page .tv-num-active-card__number {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .tv-num-page .tv-num-active-card__plan {
      margin: 0.2rem 0 0;
      font-size: 0.85rem;
      color: var(--tv-muted, #64748b);
    }
    .tv-num-page .tv-num-caps {
      margin: 0.65rem 0 0;
      font-size: 0.84rem;
      color: var(--tv-muted, #64748b);
      line-height: 1.45;
    }
    .tv-num-page .tv-num-active-card__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin-top: 0.85rem;
      padding-top: 0.85rem;
      border-top: 1px solid var(--tv-border, rgba(15, 23, 42, 0.08));
    }
    .tv-num-page .tv-num-associated {
      margin-top: 0.5rem;
      opacity: 0.92;
    }
    .tv-num-page .tv-num-associated summary {
      cursor: pointer;
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--tv-muted, #64748b);
      list-style: none;
    }
    .tv-num-page .tv-num-associated summary::-webkit-details-marker { display: none; }
    .tv-num-page .tv-num-associated__body {
      margin-top: 0.75rem;
      display: grid;
      gap: 0.65rem;
    }
    @media (min-width: 720px) {
      .tv-num-page .tv-num-active-grid {
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      }
    }
  </style>`;
}

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
    active: "Activo",
    pending_activation: "En configuración",
    suspended: "Suspendido",
  };
  const cls = clsMap[status] ?? "muted";
  const label =
    labelMap[status] ??
    clientNumberStatusLabel(status as ClientNumberListItem["status"]);
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

function renderCapabilities(caps: ClientNumberListItem["capabilities"]): string {
  const items: string[] = [];
  if (caps.send_sms) items.push("Envío SMS");
  if (caps.receive_sms) items.push("Recepción SMS");
  if (caps.api_webhook) items.push("Bandeja / API / webhook");
  if (caps.otp_authorized) items.push("OTP autorizado");
  return items.length ? items.map((i) => escapeHtml(i)).join(" · ") : "—";
}

function plansLandingUrl(): string {
  return `${env.publicSiteUrl.replace(/\/$/, "")}/numeracion-sim.html`;
}

function renderEmptyState(): string {
  return `<section class="tv-num-section">
    <article class="tv-num-card tv-num-empty">
      <h2 class="tv-num-empty__title">Aún no tienes una numeración activa</h2>
      <p class="tv-num-empty__text">
        Tu empresa todavía no tiene un número SIM Telvoice asignado. Cuando activemos tu numeración,
        aparecerá aquí con su estado, plan y accesos operativos.
      </p>
      <div class="tv-num-status-pill">
        <span class="material-symbols-outlined" style="font-size:1rem" aria-hidden="true">info</span>
        Estado actual: sin numeración asignada
      </div>
      <div class="tv-num-empty__actions">
        ${renderBtn("Solicitar numeración", { href: plansLandingUrl(), variant: "primary", icon: "add_call" })}
        ${renderBtn("Ver bandeja SMS", { href: "/app/sms-inbox", variant: "secondary", icon: "inbox" })}
      </div>
    </article>
  </section>`;
}

function renderPendingSimActivations(activations: SimActivationRequestRow[]): string {
  if (!activations.length) return "";

  const cards = activations
    .map((a) => {
      const statusCls =
        a.activation_status === "paid_pending_activation" ? "warn" : "muted";
      return `<article class="tv-num-card tv-num-activation-card">
        <h3 class="tv-num-activation-card__title">Numeración Telvoice en configuración</h3>
        <p class="tv-num-activation-card__text">
          Telvoice está preparando la numeración y validando su disponibilidad técnica.
        </p>
        <dl class="tv-num-meta">
          <div><dt>Plan</dt><dd>${escapeHtml(a.plan_name)}</dd></div>
          <div><dt>Estado</dt><dd><span class="badge badge-${statusCls}">${escapeHtml(simActivationStatusLabel(a.activation_status))}</span></dd></div>
          <div><dt>Fecha</dt><dd>${formatDate(a.created_at)}</dd></div>
          <div><dt>Referencia</dt><dd>${escapeHtml(a.id.slice(0, 8).toUpperCase())}</dd></div>
          <div><dt>SMS incluidos</dt><dd>${escapeHtml(new Intl.NumberFormat("es-CL").format(a.included_sms_monthly))} / mes</dd></div>
          <div><dt>Próximo paso</dt><dd>Validación técnica Telvoice</dd></div>
        </dl>
      </article>`;
    })
    .join("");

  return `<section class="tv-num-section">
    <h2 class="tv-num-section__title">Activaciones en curso</h2>
    <div class="tv-num-activation-grid">${cards}</div>
  </section>`;
}

function renderAssociatedServices(requests: AgentPlanRequestRow[]): string {
  const pending = requests.filter((r) =>
    ["paid_pending_setup", "pending", "reviewing", "approved"].includes(r.status),
  );
  if (!pending.length) return "";

  const cards = pending
    .map((r) => {
      const def = getAgentPlanDefinition(r.plan_code);
      const statusCls = r.status === "paid_pending_setup" ? "warn" : "muted";
      return `<article class="tv-num-card">
        <h3 class="tv-num-activation-card__title">Servicio de agente asociado</h3>
        <p class="tv-num-activation-card__text">Configuración del plan de agente vinculado a tu contrato.</p>
        <dl class="tv-num-meta">
          <div><dt>Plan</dt><dd>${escapeHtml(def?.name ?? r.plan_code)}</dd></div>
          <div><dt>Estado</dt><dd><span class="badge badge-${statusCls}">${escapeHtml(agentPlanStatusLabel(r.status))}</span></dd></div>
          <div><dt>Fecha</dt><dd>${formatDate(r.created_at)}</dd></div>
        </dl>
      </article>`;
    })
    .join("");

  return `<details class="tv-num-section tv-num-associated">
    <summary>Servicios asociados (${pending.length})</summary>
    <div class="tv-num-associated__body">${cards}</div>
  </details>`;
}

function renderActiveNumberCard(n: ClientNumberListItem): string {
  const detailHref = `/app/numeraciones/${encodeURIComponent(n.id)}/integraciones`;
  const inboxHref = `/app/sms-inbox?number=${encodeURIComponent(n.id)}`;

  return `<article class="tv-num-card tv-num-active-card">
    <div class="tv-num-active-card__head">
      <div>
        <h3 class="tv-num-active-card__number">${escapeHtml(n.number)}${renderQaLabBadge(n.provider)}</h3>
        <p class="tv-num-active-card__plan">${escapeHtml(n.plan_label || "Plan Telvoice")} · ${escapeHtml(clientNumberTypeLabel(n.type))}</p>
      </div>
      ${renderStatusBadge(n.status)}
    </div>
    <dl class="tv-num-meta">
      <div><dt>Último SMS</dt><dd>${n.last_sms_at ? formatDate(n.last_sms_at) : "—"}</dd></div>
      <div><dt>Origen último SMS</dt><dd>${n.last_sms_from ? escapeHtml(n.last_sms_from) : "—"}</dd></div>
    </dl>
    <p class="tv-num-caps">${renderCapabilities(n.capabilities)}</p>
    <div class="tv-num-active-card__actions">
      ${renderBtn("Bandeja SMS", { href: inboxHref, variant: "primary", size: "sm", icon: "inbox" })}
      ${renderBtn("Configurar webhooks", { href: detailHref, variant: "secondary", size: "sm", icon: "hub" })}
    </div>
  </article>`;
}

function renderActiveNumbers(numbers: ClientNumberListItem[]): string {
  if (!numbers.length) return "";

  const cards = numbers.map(renderActiveNumberCard).join("");
  return `<section class="tv-num-section">
    <h2 class="tv-num-section__title">Tus numeraciones activas</h2>
    <div class="tv-num-active-grid">${cards}</div>
  </section>`;
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

  const hasNumbers = data.numbers.length > 0;
  const hasSimPending = data.pendingSimActivations.length > 0;

  const body = `
    ${numeracionesPageStyles()}
    <div class="tv-num-page">
    ${renderPageHeader({
      title: "Mis numeraciones",
      subtitle:
        "Administra los números Telvoice asignados a tu empresa, revisa su estado y accede a herramientas de operación SMS.",
      actions: `
        ${renderBtn("Bandeja SMS", { href: "/app/sms-inbox", variant: "secondary", icon: "inbox" })}
        ${renderBtn("Solicitar numeración", { href: plansLandingUrl(), variant: "primary", icon: "add_call" })}
      `,
    })}
    ${migrationNotice}
    ${renderPendingSimActivations(data.pendingSimActivations)}
    ${hasNumbers ? renderActiveNumbers(data.numbers) : !hasSimPending ? renderEmptyState() : ""}
    ${renderAssociatedServices(data.pendingAgentRequests)}
    </div>`;

  return wrapAppPage(ctx, "numeraciones", "Mis numeraciones", body);
}
