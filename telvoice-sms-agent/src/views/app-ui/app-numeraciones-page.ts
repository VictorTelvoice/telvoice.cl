import {
  clientNumberStatusLabel,
  clientNumberTypeLabel,
} from "../../services/clientNumberService.js";
import type { ClientNumberListItem, ClientNumbersModuleState } from "../../types/client-numbers.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import { renderAgentModuleStyles } from "../shared/agent-module-styles.js";
import {
  escapeHtml,
  formatDate,
  formatDateShort,
  formatPhoneDisplay,
  formatRelativeTime,
} from "../../utils/html.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

const COUNTRY_LABELS: Record<string, string> = {
  CL: "Chile",
  AR: "Argentina",
  PE: "Perú",
  CO: "Colombia",
  MX: "México",
};

function countryLabel(code: string | null | undefined): string {
  const c = (code ?? "CL").trim().toUpperCase();
  return COUNTRY_LABELS[c] ?? c;
}

function displayPlanLabel(n: ClientNumberListItem): string {
  return n.plan_code ? n.plan_label : "Sin plan activo";
}

function displayAgentLabel(n: ClientNumberListItem): string {
  return n.has_agent ? "Agente asignado" : "Agente no asignado";
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
  const cls = clsMap[status] ?? "muted";
  const label = clientNumberStatusLabel(status as ClientNumberListItem["status"]);
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

function renderTypeChip(type: ClientNumberListItem["type"]): string {
  const label = clientNumberTypeLabel(type);
  const cls = type === "sim_real" ? "tv-num-chip--type-sim" : "tv-num-chip--type-line";
  return `<span class="tv-num-chip ${cls}">${escapeHtml(label)}</span>`;
}

function renderCountryChip(code: string | null | undefined): string {
  return `<span class="tv-num-chip tv-num-chip--country">${escapeHtml(countryLabel(code))}</span>`;
}

function renderCapabilityChips(caps: ClientNumberListItem["capabilities"]): string {
  const items: { label: string; cls: string }[] = [];
  if (caps.receive_sms) items.push({ label: "Recibir SMS", cls: "tv-num-chip--cap" });
  if (caps.send_sms) items.push({ label: "Enviar SMS", cls: "tv-num-chip--cap" });
  if (caps.otp_authorized) items.push({ label: "OTP autorizado", cls: "tv-num-chip--cap-otp" });
  if (caps.api_webhook) items.push({ label: "API/Webhook", cls: "tv-num-chip--cap-api" });
  if (!items.length) {
    return `<span class="tv-num-chip tv-num-chip--cap">Sin capacidades activas</span>`;
  }
  return items
    .map((i) => `<span class="tv-num-chip ${i.cls}">${escapeHtml(i.label)}</span>`)
    .join("");
}

function renderLastSmsCell(n: ClientNumberListItem): string {
  if (!n.last_sms_at) return "Sin mensajes recibidos";
  const when = formatRelativeTime(n.last_sms_at);
  const detail = n.last_sms_from
    ? `<small>Desde ${escapeHtml(n.last_sms_from)}</small>`
    : "";
  return `${escapeHtml(when)}${detail}`;
}

function computeKpis(numbers: ClientNumberListItem[]): {
  active: number;
  simReal: number;
  withPlan: number;
  lastSmsLabel: string;
  lastSmsHint: string;
} {
  const active = numbers.filter((n) => n.status === "active").length;
  const simReal = numbers.filter((n) => n.type === "sim_real").length;
  const withPlan = numbers.filter((n) => n.plan_code != null).length;

  let latest: string | null = null;
  for (const n of numbers) {
    if (n.last_sms_at && (!latest || n.last_sms_at > latest)) {
      latest = n.last_sms_at;
    }
  }

  let lastSmsLabel = "Sin actividad";
  let lastSmsHint = "Aún no hay SMS entrantes";
  if (latest) {
    const rel = formatRelativeTime(latest);
    const isRelative = rel.startsWith("hace");
    lastSmsLabel = isRelative ? rel : formatDateShort(latest);
    lastSmsHint = isRelative ? formatDateShort(latest) : "Último mensaje recibido";
  }

  return { active, simReal, withPlan, lastSmsLabel, lastSmsHint };
}

function renderKpiGrid(numbers: ClientNumberListItem[]): string {
  const k = computeKpis(numbers);
  return `<div class="tv-kpi-grid tv-kpi-grid--client tv-numeraciones-kpis">
    ${renderKpiCard({
      label: "Numeraciones activas",
      value: String(k.active),
      hint: `${numbers.length} en total`,
      icon: "sim_card",
      variant: "success",
    })}
    ${renderKpiCard({
      label: "SIM reales",
      value: String(k.simReal),
      hint: "Líneas móviles Chile",
      icon: "phonelink_ring",
      variant: "primary",
    })}
    ${renderKpiCard({
      label: "Con plan activo",
      value: String(k.withPlan),
      hint: "Agente y funciones comerciales",
      icon: "verified",
      variant: k.withPlan > 0 ? "success" : "warn",
    })}
    ${renderKpiCard({
      label: "Último SMS recibido",
      value: k.lastSmsLabel,
      hint: k.lastSmsHint,
      icon: "sms",
      variant: "default",
    })}
  </div>`;
}

function renderNumberActions(n: ClientNumberListItem): string {
  const id = encodeURIComponent(n.id);
  const integraciones = `/app/numeraciones/${id}/integraciones`;
  const bandeja = `/app/sms-inbox?number=${id}`;
  const planes = "/app/planes-agente";
  const agente = "/app/agente";
  const hasPlan = n.plan_code != null;
  const buttons: string[] = [];

  if (hasPlan) {
    if (n.capabilities.receive_sms || n.last_sms_at) {
      buttons.push(renderBtn("Bandeja", { href: bandeja, size: "sm", variant: "ghost", icon: "inbox" }));
    }
    buttons.push(
      renderBtn("Configurar", { href: integraciones, size: "sm", variant: "ghost", icon: "settings" }),
    );
    if (n.capabilities.api_webhook) {
      buttons.push(
        renderBtn("Integración", { href: integraciones, size: "sm", variant: "ghost", icon: "webhook" }),
      );
    }
    buttons.push(
      renderBtn("Asignar agente", { href: agente, size: "sm", variant: "ghost", icon: "smart_toy" }),
    );
    if (n.last_sms_at) {
      buttons.push(
        renderBtn("Ver actividad", { href: bandeja, size: "sm", variant: "ghost", icon: "history" }),
      );
    }
  } else {
    buttons.push(
      renderBtn("Activar plan", { href: planes, size: "sm", variant: "primary", icon: "bolt" }),
    );
    buttons.push(
      renderBtn("Configurar", { href: integraciones, size: "sm", variant: "ghost", icon: "settings" }),
    );
    buttons.push(
      renderBtn("Ver planes", { href: planes, size: "sm", variant: "secondary", icon: "sim_card" }),
    );
  }

  return buttons.join("\n");
}

function renderNumberCard(n: ClientNumberListItem): string {
  const planLabel = displayPlanLabel(n);
  const agentLabel = displayAgentLabel(n);
  const planChipCls = n.plan_code ? "" : " tv-num-chip--plan-none";
  const agentChipCls = n.has_agent ? " tv-num-chip--agent-yes" : " tv-num-chip--agent-no";

  return `<article class="tv-num-card">
    <header class="tv-num-card__head">
      <h2 class="tv-num-card__number">${escapeHtml(formatPhoneDisplay(n.number))}</h2>
      <div class="tv-num-card__badges">
        ${renderStatusBadge(n.status)}
        ${renderTypeChip(n.type)}
        ${renderCountryChip(n.country_code)}
      </div>
    </header>
    <div class="tv-num-card__body">
      <dl class="tv-num-card__meta">
        <dt>Plan</dt>
        <dd><span class="tv-num-chip${planChipCls}">${escapeHtml(planLabel)}</span></dd>
        <dt>Agente</dt>
        <dd><span class="tv-num-chip${agentChipCls}">${escapeHtml(agentLabel)}</span></dd>
        <dt>Último SMS</dt>
        <dd>${renderLastSmsCell(n)}</dd>
        <dt>Activación</dt>
        <dd>${n.activated_at ? escapeHtml(formatDate(n.activated_at)) : "Pendiente"}</dd>
        <dt>Renovación</dt>
        <dd>${n.expires_at ? escapeHtml(formatDate(n.expires_at)) : "—"}</dd>
      </dl>
      <div class="tv-num-card__caps" aria-label="Capacidades">
        ${renderCapabilityChips(n.capabilities)}
      </div>
    </div>
    <footer class="tv-num-card__actions">
      ${renderNumberActions(n)}
    </footer>
  </article>`;
}

function renderEmptyState(): string {
  return `<section class="tv-panel tv-numeraciones-empty">
    <div class="tv-numeraciones-empty__icon" aria-hidden="true">
      <span class="material-symbols-outlined">sim_card</span>
    </div>
    <h2 class="tv-numeraciones-empty__title">Todavía no tienes numeraciones contratadas.</h2>
    <p class="tv-numeraciones-empty__text">
      Solicita una SIM real o numeración SMS para recibir mensajes, validar servicios
      y conectar webhooks.
    </p>
    <div class="tv-numeraciones-empty__actions">
      ${renderBtn("Solicitar número", { href: "/app/planes-agente?action=request", variant: "primary", icon: "add_call" })}
      ${renderBtn("Ver planes", { href: "/app/planes-agente", variant: "secondary", icon: "sim_card" })}
    </div>
  </section>`;
}

function renderNumbersGrid(numbers: ClientNumberListItem[]): string {
  if (!numbers.length) return renderEmptyState();
  const cards = numbers.map(renderNumberCard).join("");
  return `${renderKpiGrid(numbers)}<div class="tv-num-cards">${cards}</div>`;
}

export type AppNumeracionesPageData = {
  module: ClientNumbersModuleState;
  numbers: ClientNumberListItem[];
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
      title: "Mis numeraciones",
      subtitle: "Gestiona tus líneas SMS, recepción, envío, webhooks y agentes asociados.",
      headClass: "tv-page-head--numeraciones",
      actions: `
        ${renderBtn("Solicitar número", { href: "/app/planes-agente?action=request", variant: "primary", icon: "add_call" })}
        ${renderBtn("Ver planes", { href: "/app/planes-agente", variant: "secondary", icon: "sim_card" })}
      `,
    })}
    <p class="tv-numeraciones-intro">
      Tus numeraciones Telvoice centralizan recepción, envío, validaciones OTP e integraciones
      API/Webhook para tu empresa.
    </p>
    ${migrationNotice}
    ${renderNumbersGrid(data.numbers)}
    ${renderAgentModuleStyles()}`;

  return wrapAppPage(ctx, "numeraciones", "Mis numeraciones", body);
}
