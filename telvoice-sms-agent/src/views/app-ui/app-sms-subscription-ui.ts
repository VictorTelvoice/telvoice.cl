import type {
  CompanySmsMpSubscription,
  SmsMpSubscriptionStatus,
} from "../../types/sms-mp-subscription.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { fmtMoney, fmtSms } from "./app-page-wrap.js";
import { renderBtn } from "../admin-ui/page-kit.js";

function subscriptionStatusLabel(status: SmsMpSubscriptionStatus): string {
  switch (status) {
    case "authorized":
      return "Activa";
    case "pending":
      return "Pendiente de autorización";
    case "paused":
      return "Pausada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

function subscriptionBadgeClass(status: SmsMpSubscriptionStatus): string {
  switch (status) {
    case "authorized":
      return "badge-ok";
    case "pending":
      return "badge-warn";
    case "paused":
      return "badge-warn";
    case "cancelled":
      return "badge-err";
    default:
      return "";
  }
}

function subscriptionHint(sub: CompanySmsMpSubscription): string {
  switch (sub.status) {
    case "authorized":
      return "Mercado Pago cargará este monto cada mes. Al aprobarse el pago, acreditamos el saldo SMS en tu cuenta automáticamente.";
    case "pending":
      return "Completa la autorización en Mercado Pago para activar el cargo mensual automático.";
    case "paused":
      return "La suscripción está pausa en Mercado Pago. Puedes reactivarla desde tu cuenta MP o contratar una nueva bolsa.";
    default:
      return "";
  }
}

export function renderSmsMpSubscriptionBanner(
  sub: CompanySmsMpSubscription | null | undefined,
): string {
  if (!sub || sub.status === "cancelled") {
    return "";
  }

  const statusLabel = subscriptionStatusLabel(sub.status);
  const badgeCls = subscriptionBadgeClass(sub.status);
  const amount = fmtMoney(sub.monthlyAmount, sub.currency);
  const sms = fmtSms(sub.smsQuantity);
  const authorizedAt = sub.authorizedAt
    ? formatDate(sub.authorizedAt)
    : null;
  const lastPaymentAt = sub.lastPaymentAt
    ? formatDate(sub.lastPaymentAt)
    : null;

  const metaRows: string[] = [
    `<div class="tv-sms-sub-banner__cell">
      <dt class="tv-sms-sub-banner__label">Bolsa mensual</dt>
      <dd class="tv-sms-sub-banner__value">${sms} SMS</dd>
    </div>`,
    `<div class="tv-sms-sub-banner__cell">
      <dt class="tv-sms-sub-banner__label">Cargo mensual</dt>
      <dd class="tv-sms-sub-banner__value">${amount}</dd>
    </div>`,
  ];

  if (authorizedAt) {
    metaRows.push(`<div class="tv-sms-sub-banner__cell">
      <dt class="tv-sms-sub-banner__label">Activa desde</dt>
      <dd class="tv-sms-sub-banner__value">${escapeHtml(authorizedAt)}</dd>
    </div>`);
  }

  if (lastPaymentAt) {
    metaRows.push(`<div class="tv-sms-sub-banner__cell">
      <dt class="tv-sms-sub-banner__label">Último cargo</dt>
      <dd class="tv-sms-sub-banner__value">${escapeHtml(lastPaymentAt)}</dd>
    </div>`);
  }

  const actions: string[] = [];
  if (sub.status === "pending" && sub.mpInitPoint) {
    actions.push(
      `<a href="${escapeHtml(sub.mpInitPoint)}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Completar autorización en Mercado Pago</a>`,
    );
  }
  if (sub.lastOrderId) {
    actions.push(
      renderBtn("Ver último cargo", {
        href: `/app/orders/${encodeURIComponent(sub.lastOrderId)}`,
        variant: sub.status === "pending" ? "secondary" : "ghost",
      }),
    );
  }
  actions.push(
    renderBtn("Mis órdenes", {
      href: "/app/orders",
      variant: "ghost",
    }),
  );

  const actionsHtml = actions.length
    ? `<div class="tv-sms-sub-banner__actions">${actions.join("")}</div>`
    : "";

  const hint = subscriptionHint(sub);

  return `<section class="tv-sms-sub-banner tv-sms-sub-banner--${escapeHtml(sub.status)}" aria-labelledby="tv-sms-sub-title">
    <div class="tv-sms-sub-banner__head">
      <span class="material-symbols-outlined tv-sms-sub-banner__icon" aria-hidden="true">autorenew</span>
      <div class="tv-sms-sub-banner__titles">
        <h2 class="tv-sms-sub-banner__title" id="tv-sms-sub-title">Suscripción mensual Mercado Pago</h2>
        <p class="tv-sms-sub-banner__sub">Cargo recurrente por la bolsa configurada en la calculadora</p>
      </div>
      <span class="badge ${badgeCls} tv-sms-sub-banner__badge">${escapeHtml(statusLabel)}</span>
    </div>
    <dl class="tv-sms-sub-banner__grid">${metaRows.join("")}</dl>
    ${actionsHtml}
    ${hint ? `<p class="tv-sms-sub-banner__hint">${escapeHtml(hint)}</p>` : ""}
  </section>`;
}

export function getSmsMpSubscriptionBannerStyles(): string {
  return `
    .tv-sms-sub-banner {
      margin-bottom: 1.25rem;
      padding: 1.1rem 1.25rem;
      border-radius: 1rem;
      border: 1px solid var(--tv-border, rgba(203, 213, 225, 0.9));
      background: var(--tv-surface, #fff);
      box-shadow: 0 4px 20px -10px rgba(15, 23, 42, 0.12);
    }
    .tv-sms-sub-banner__head {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .tv-sms-sub-banner__icon {
      font-size: 1.75rem;
      color: #0052cc;
      flex-shrink: 0;
    }
    .tv-sms-sub-banner__titles {
      flex: 1;
      min-width: 12rem;
    }
    .tv-sms-sub-banner__title {
      margin: 0;
      font-family: Montserrat, Inter, sans-serif;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--tv-text, #0f172a);
    }
    .tv-sms-sub-banner__sub {
      margin: 0.2rem 0 0;
      font-size: 0.82rem;
      color: var(--tv-muted, #64748b);
    }
    .tv-sms-sub-banner__badge {
      margin-left: auto;
      flex-shrink: 0;
    }
    .tv-sms-sub-banner__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: 0.85rem 1.25rem;
      margin: 1rem 0 0;
      padding: 0;
    }
    .tv-sms-sub-banner__cell {
      margin: 0;
    }
    .tv-sms-sub-banner__label {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--tv-muted, #64748b);
    }
    .tv-sms-sub-banner__value {
      margin: 0.2rem 0 0;
      font-size: 1rem;
      font-weight: 700;
      color: var(--tv-text, #0f172a);
    }
    .tv-sms-sub-banner__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .tv-sms-sub-banner__hint {
      margin: 0.85rem 0 0;
      font-size: 0.82rem;
      line-height: 1.45;
      color: var(--tv-muted, #64748b);
    }
    .tv-sms-sub-banner--authorized {
      border-color: rgba(0, 82, 204, 0.18);
      background: linear-gradient(145deg, #ffffff 0%, #f0f7ff 100%);
    }
    .tv-sms-sub-banner--pending {
      border-color: rgba(217, 119, 6, 0.25);
      background: linear-gradient(145deg, #fffbeb 0%, #fff 100%);
    }
    .tv-sms-sub-banner--paused {
      border-color: rgba(100, 116, 139, 0.25);
      background: #f8fafc;
    }
    .tv-lab-theme .tv-sms-sub-banner--authorized {
      background: linear-gradient(145deg, rgba(12, 20, 48, 0.92) 0%, rgba(0, 82, 204, 0.12) 100%);
      border-color: rgba(56, 189, 248, 0.22);
    }
    .tv-lab-theme .tv-sms-sub-banner--pending {
      background: rgba(12, 20, 48, 0.88);
      border-color: rgba(251, 191, 36, 0.28);
    }
    .tv-lab-theme .tv-sms-sub-banner--paused {
      background: rgba(12, 20, 48, 0.78);
    }
  `;
}
