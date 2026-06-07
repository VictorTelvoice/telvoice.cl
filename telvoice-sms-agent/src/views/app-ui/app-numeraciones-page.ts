import {
  clientNumberStatusLabel,
  clientNumberTypeLabel,
} from "../../services/clientNumberService.js";
import type {
  ClientNumberListItem,
  ClientNumbersModuleState,
} from "../../types/client-numbers.js";
import type { SimActivationRequestRow } from "../../types/sim-activation.js";
import { simActivationStatusLabel } from "../../services/simActivationService.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
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
  const cls = clsMap[status] ?? "muted";
  const label = clientNumberStatusLabel(status as ClientNumberListItem["status"]);
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

  return `<section class="tv-sim-pending-list">${cards}</section>`;
}

function renderEmptyState(): string {
  return `<section class="tv-panel tv-numeraciones-empty">
    <div class="tv-numeraciones-empty__icon" aria-hidden="true">
      <span class="material-symbols-outlined">sim_card</span>
    </div>
    <h2 class="tv-numeraciones-empty__title">Aún no tienes numeraciones Telvoice</h2>
    <p class="tv-numeraciones-empty__text">
      Contrata un número real o de red fija para recibir SMS, validar cuentas autorizadas
      y operar comunicaciones empresariales sin depender de un teléfono físico.
    </p>
    <div class="tv-numeraciones-empty__actions">
      ${renderBtn("Ver planes del agente", { href: "/app/planes-agente", variant: "primary", icon: "smart_toy" })}
      ${renderBtn("Solicitar numeración", { href: "/app/planes-agente?action=request", variant: "secondary", icon: "add_call" })}
    </div>
  </section>`;
}

function renderNumbersTable(numbers: ClientNumberListItem[]): string {
  if (!numbers.length) return renderEmptyState();

  const rows = numbers
    .map((n) => {
      const actions = `
        ${renderBtn("Bandeja", { href: `/app/sms-inbox?number=${encodeURIComponent(n.id)}`, size: "sm", variant: "ghost" })}
        ${renderBtn("Configurar", { href: `/app/numeraciones/${encodeURIComponent(n.id)}/integraciones`, size: "sm", variant: "ghost" })}
        ${renderBtn("Integraciones", { href: `/app/numeraciones/${encodeURIComponent(n.id)}/integraciones`, size: "sm", variant: "ghost" })}
      `;
      return `<tr>
        <td><strong>${escapeHtml(n.number)}</strong></td>
        <td>${escapeHtml(clientNumberTypeLabel(n.type))}</td>
        <td>${escapeHtml(n.country_code ?? "CL")}</td>
        <td>${renderStatusBadge(n.status)}</td>
        <td>${escapeHtml(n.plan_label)}</td>
        <td>${n.has_agent ? "Sí" : "No"}</td>
        <td class="tv-numeraciones-caps">${renderCapabilities(n.capabilities)}</td>
        <td>${n.last_sms_at ? `${formatDate(n.last_sms_at)}${n.last_sms_from ? `<br><small>${escapeHtml(n.last_sms_from)}</small>` : ""}` : "—"}</td>
        <td>${n.activated_at ? formatDate(n.activated_at) : "—"}</td>
        <td>${n.expires_at ? formatDate(n.expires_at) : "—"}</td>
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
          <th>País</th>
          <th>Estado</th>
          <th>Plan</th>
          <th>Agente</th>
          <th>Capacidad</th>
          <th>Último SMS</th>
          <th>Activación</th>
          <th>Renovación</th>
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
};

export function renderAppNumeracionesPage(
  ctx: AppPageContext,
  data: AppNumeracionesPageData,
): string {
  const migrationNotice = data.module.migrationPending
    ? `<div class="alert alert-warn tv-notice-block">El módulo de numeraciones requiere aplicar la migración 054 en Supabase.</div>`
    : "";

  const simModuleNotice =
    data.pendingSimActivations.length && data.module.migrationPending
      ? ""
      : data.pendingSimActivations.length
        ? ""
        : "";

  const body = `
    ${renderPageHeader({
      title: "Mis números",
      subtitle: "Numeraciones Telvoice contratadas por tu empresa.",
      actions: `
        ${renderBtn("Solicitar nueva numeración", { href: "/app/planes-agente?action=request", variant: "primary", icon: "add_call" })}
        ${renderBtn("Ver planes del agente", { href: "/app/planes-agente", variant: "secondary", icon: "smart_toy" })}
      `,
    })}
    ${migrationNotice}
    ${renderPendingSimActivations(data.pendingSimActivations)}
    ${simModuleNotice}
    <section class="tv-panel">
      ${renderNumbersTable(data.numbers)}
    </section>
    <style>
      .tv-sim-pending-list { display: grid; gap: 1rem; margin-bottom: 1rem; }
      .tv-sim-pending-card__title { margin: 0 0 0.5rem; font-size: 1.1rem; }
      .tv-sim-pending-card__text { margin: 0 0 1rem; opacity: 0.9; }
      .tv-sim-pending-card__meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin: 0; }
      .tv-sim-pending-card__meta dt { font-size: 0.75rem; opacity: 0.7; margin: 0; }
      .tv-sim-pending-card__meta dd { margin: 0.15rem 0 0; font-weight: 600; }
      .tv-numeraciones-empty { text-align: center; padding: 3rem 2rem; }
      .tv-numeraciones-empty__icon .material-symbols-outlined { font-size: 3rem; opacity: 0.5; }
      .tv-numeraciones-empty__title { margin: 1rem 0 0.5rem; font-size: 1.25rem; }
      .tv-numeraciones-empty__text { max-width: 36rem; margin: 0 auto 1.5rem; opacity: 0.85; }
      .tv-numeraciones-empty__actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      .tv-numeraciones-caps { font-size: 0.85rem; }
      .tv-table-actions { white-space: nowrap; }
    </style>`;

  return wrapAppPage(ctx, "numeraciones", "Mis números", body);
}
