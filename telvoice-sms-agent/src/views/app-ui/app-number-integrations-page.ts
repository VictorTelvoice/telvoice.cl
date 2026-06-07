import { clientNumberTypeLabel, clientNumberStatusLabel } from "../../services/clientNumberService.js";
import type { ClientNumberRow, NumberIntegrationRow } from "../../types/client-numbers.js";
import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderPageHeader, renderPanel } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

const AVAILABLE_EVENTS = [
  "sms.received",
  "otp.detected",
  "message.forwarded",
  "number.status_changed",
];

function renderIntegrationCard(
  type: "telegram" | "webhook" | "api",
  integration: NumberIntegrationRow | undefined,
  numberId: string,
): string {
  const labels = {
    telegram: "Telegram",
    webhook: "Webhook",
    api: "API",
  };
  const icons = {
    telegram: "send",
    webhook: "webhook",
    api: "api",
  };

  const status = integration?.status ?? "inactive";
  const statusCls =
    status === "active" ? "ok" : status === "error" ? "err" : "muted";

  let configHtml = "";
  if (type === "webhook") {
    const url =
      typeof integration?.config?.url === "string" ? integration.config.url : "";
    configHtml = `
      <form method="post" action="/app/numeraciones/${encodeURIComponent(numberId)}/integraciones" class="tv-integ-form">
        <input type="hidden" name="integration_type" value="webhook" />
        <label>URL de webhook<input type="url" name="webhook_url" class="tv-filter-input" value="${escapeHtml(url)}" placeholder="https://..." /></label>
        <label>Secret<input type="text" name="webhook_secret" class="tv-filter-input" placeholder="Opcional" autocomplete="off" /></label>
        ${renderBtn("Guardar", { type: "submit", variant: "secondary", size: "sm" })}
        <button type="submit" formaction="/app/numeraciones/${escapeHtml(numberId)}/webhook/test" class="btn btn-ghost btn-sm">Probar webhook</button>
      </form>`;
  } else if (type === "telegram") {
    const chatId =
      typeof integration?.config?.chat_id === "string"
        ? integration.config.chat_id
        : "";
    configHtml = `
      <p class="tv-integ-hint">Conecta un bot de Telegram para recibir SMS entrantes y códigos OTP.</p>
      <form method="post" action="/app/numeraciones/${encodeURIComponent(numberId)}/integraciones" class="tv-integ-form">
        <input type="hidden" name="integration_type" value="telegram" />
        <label>Chat ID<input type="text" name="telegram_chat_id" class="tv-filter-input" value="${escapeHtml(chatId)}" placeholder="ID del chat o canal" /></label>
        ${renderBtn("Conectar", { type: "submit", variant: "secondary", size: "sm" })}
        <button type="submit" formaction="/app/numeraciones/${escapeHtml(numberId)}/telegram/test" class="btn btn-ghost btn-sm">Enviar prueba</button>
      </form>`;
  } else {
    configHtml = `<p class="tv-integ-hint">Usa tu API key del panel para integrar recepción SMS. Disponible en plan Business.</p>
      ${renderBtn("Ver API", { href: "/app/api", variant: "secondary", size: "sm" })}`;
  }

  return `<section class="tv-panel tv-integ-card">
    <header class="tv-section-head">
      <h2 class="tv-section-head__title">
        <span class="material-symbols-outlined" aria-hidden="true">${icons[type]}</span>
        ${escapeHtml(labels[type])}
      </h2>
      <span class="badge badge-${statusCls}">${escapeHtml(status)}</span>
    </header>
    <div class="tv-panel__body">${configHtml}</div>
  </section>`;
}

export type AppNumberIntegrationsPageData = {
  number: ClientNumberRow;
  integrations: NumberIntegrationRow[];
};

export function renderAppNumberIntegrationsPage(
  ctx: AppPageContext,
  data: AppNumberIntegrationsPageData,
): string {
  const { number, integrations } = data;
  const byType = (t: NumberIntegrationRow["type"]) =>
    integrations.find((i) => i.type === t);

  const eventsList = AVAILABLE_EVENTS.map(
    (e) => `<code class="tv-integ-event">${escapeHtml(e)}</code>`,
  ).join(" ");

  const body = `
    ${renderPageHeader({
      title: "Integraciones",
      subtitleHtml: `<strong>${escapeHtml(number.number)}</strong> · ${escapeHtml(clientNumberTypeLabel(number.type))} · ${escapeHtml(clientNumberStatusLabel(number.status))}`,
      actions: `
        ${renderBtn("Bandeja SMS", { href: `/app/sms-inbox?number=${encodeURIComponent(number.id)}`, variant: "secondary", icon: "inbox" })}
        ${renderBtn("Mis números", { href: "/app/numeraciones", variant: "ghost" })}
      `,
    })}
    ${ctx.flash ? `<div class="alert tv-notice-block">${escapeHtml(ctx.flash)}</div>` : ""}
    ${ctx.error ? `<div class="alert alert-err">${escapeHtml(ctx.error)}</div>` : ""}
    <div class="tv-integ-grid">
      ${renderIntegrationCard("telegram", byType("telegram"), number.id)}
      ${renderIntegrationCard("webhook", byType("webhook"), number.id)}
      ${renderIntegrationCard("api", byType("api"), number.id)}
    </div>
    ${renderPanel("Eventos disponibles", `<p>Los webhooks pueden suscribirse a los siguientes eventos:</p><div class="tv-integ-events">${eventsList}</div>`)}
    <style>
      .tv-integ-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
      .tv-integ-card .tv-section-head { display: flex; justify-content: space-between; align-items: center; }
      .tv-integ-form { display: flex; flex-direction: column; gap: 0.75rem; }
      .tv-integ-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
      .tv-integ-hint { font-size: 0.85rem; opacity: 0.75; margin-bottom: 0.75rem; }
      .tv-integ-events { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
      .tv-integ-event { padding: 0.2rem 0.5rem; border-radius: 4px; background: rgba(255,255,255,0.06); font-size: 0.8rem; }
    </style>`;

  return wrapAppPage(ctx, "numeraciones", "Integraciones", body);
}
