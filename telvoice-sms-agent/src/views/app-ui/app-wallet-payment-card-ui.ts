import type { SmsPackageRow } from "../../types/wallet.js";
import type { CompanyPaymentCardConfig } from "../../types/company-payment-card.js";
import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import { renderKpiCard } from "../admin-ui/components.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";

function billingModeLabel(mode: CompanyPaymentCardConfig["billingMode"]): string {
  return mode === "recurring" ? "Cobro recurrente" : "Cobro por demanda";
}

export function renderWalletPaymentCardKpi(options: {
  card: CompanyPaymentCardConfig;
  walletStatus: string;
  mercadoPagoAvailable: boolean;
  defaultPackage?: SmsPackageRow | null;
}): string {
  const { card } = options;
  const configured = Boolean(card.configured && card.lastFour);
  const href = "/app/wallet/payment-card";

  const label = "Tarjeta";
  const value = configured ? `•••• ${card.lastFour}` : "Agregar";
  const hint = configured
    ? `Configurada · ${escapeHtml(billingModeLabel(card.billingMode))}`
    : "Configura una tarjeta para comprar bolsas en pocos pasos.";

  return `<a href="${href}" class="tv-wallet-pay-kpi" aria-label="${configured ? "Configurar tarjeta" : "Agregar tarjeta"}">
    ${renderKpiCard({
      label,
      value,
      hint,
      icon: "credit_card",
      variant: configured ? "success" : "primary",
    })}
    <span class="tv-wallet-pay-kpi__cta">${configured ? "Configurar" : "Agregar tarjeta"}</span>
  </a>`;
}

function renderPackageOptions(
  packages: SmsPackageRow[],
  selectedId?: string | null,
): string {
  const opts = [
    `<option value="">Selecciona bolsa predeterminada</option>`,
    ...packages.map((p) => {
      const on = selectedId === p.id;
      return `<option value="${escapeHtml(p.id)}"${on ? " selected" : ""}>${escapeHtml(p.name)} — ${fmtSms(p.sms_quantity)} SMS</option>`;
    }),
  ];
  return opts.join("");
}

export function renderAppWalletPaymentCardPage(
  ctx: AppPageContext,
  card: CompanyPaymentCardConfig,
  packages: SmsPackageRow[],
  mercadoPagoAvailable: boolean,
  flash?: { ok?: string; error?: string },
): string {
  const billingRecurring = card.billingMode === "recurring";
  const mpBlock = mercadoPagoAvailable
    ? `<section class="tv-panel" style="margin-top:1rem">
        <header class="tv-section-head" style="padding:1rem 1.15rem 0">
          <h2 class="tv-section-head__title">Vincular tarjeta</h2>
          <p class="tv-section-head__sub">Completa un pago de verificación con Mercado Pago. La tarjeta quedará guardada para compras rápidas.</p>
        </header>
        <div class="tv-panel__body">
          <form method="post" action="/app/wallet/payment-card/link" class="tv-form-grid">
            ${renderFilterField(
              "Bolsa para vincular",
              `<select name="package_id" class="tv-filter-input" required>${renderPackageOptions(packages, card.defaultPackageId)}</select>`,
            )}
            <div style="grid-column:1/-1">
              <button type="submit" class="btn btn-primary">Vincular con Mercado Pago</button>
            </div>
          </form>
          <p class="field-hint" style="margin:0.75rem 0 0">Al aprobar el pago se acreditan los SMS de la bolsa elegida y se registra la tarjeta para futuras compras.</p>
        </div>
      </section>`
    : `<p class="field-hint" style="margin-top:1rem">Mercado Pago no está disponible. Guarda tus preferencias y contacta a soporte para habilitar cobro con tarjeta.</p>`;

  const preview = renderWalletPaymentCardKpi({
    card,
    walletStatus: ctx.balance.status,
    mercadoPagoAvailable,
    defaultPackage:
      packages.find((p) => p.id === card.defaultPackageId) ?? packages[0] ?? null,
  });

  const alert = flash?.error
    ? `<div class="alert alert-danger" role="alert">${escapeHtml(flash.error)}</div>`
    : flash?.ok
      ? `<div class="alert alert-success" role="status">${escapeHtml(flash.ok)}</div>`
      : "";

  const body = `
    <div class="tv-wallet-payment-setup tv-client-dashboard">
    ${renderPageHeader({
      title: "Tarjeta de cobro",
      subtitle: "Configura cobro fijo o recurrente para comprar bolsas más rápido.",
      actions: renderBtn("Volver a Mi saldo", {
        href: "/app/wallet",
        variant: "ghost",
      }),
    })}
    ${alert}
    <div class="tv-wallet-payment-setup__preview">
      <p class="tv-wallet-payment-setup__preview-label">Vista previa</p>
      <div class="tv-kpi-grid tv-kpi-grid--client" style="max-width:320px">${preview}</div>
    </div>
    <section class="tv-panel">
      <header class="tv-section-head" style="padding:1rem 1.15rem 0">
        <h2 class="tv-section-head__title">Preferencias de cobro</h2>
        <p class="tv-section-head__sub">Define cómo quieres pagar tus próximas bolsas SMS</p>
      </header>
      <div class="tv-panel__body">
        <form method="post" action="/app/wallet/payment-card" class="tv-form-grid">
          <fieldset class="tv-wallet-billing-mode" style="border:0;padding:0;margin:0">
            <legend class="tv-filter-field__label" style="margin-bottom:0.5rem">Modo de cobro</legend>
            <label class="tv-wallet-billing-mode__opt">
              <input type="radio" name="billing_mode" value="on_demand"${!billingRecurring ? " checked" : ""} />
              <span><strong>Por demanda</strong> — pagas cada bolsa al comprarla</span>
            </label>
            <label class="tv-wallet-billing-mode__opt">
              <input type="radio" name="billing_mode" value="recurring"${billingRecurring ? " checked" : ""} />
              <span><strong>Recurrente</strong> — usa la tarjeta guardada para recargas rápidas</span>
            </label>
          </fieldset>
          <label class="tv-wallet-auto-recharge" style="display:flex;align-items:center;gap:0.5rem">
            <input type="checkbox" name="auto_recharge" value="1"${card.autoRechargeEnabled ? " checked" : ""} />
            <span>Activar recarga automática cuando el saldo sea bajo (próximamente)</span>
          </label>
          ${renderFilterField(
            "Bolsa predeterminada",
            `<select name="default_package_id" class="tv-filter-input">${renderPackageOptions(packages, card.defaultPackageId)}</select>`,
          )}
          <div style="grid-column:1/-1;display:flex;gap:0.5rem;flex-wrap:wrap">
            <button type="submit" class="btn btn-primary">Guardar preferencias</button>
            <a href="/app/wallet" class="btn btn-ghost">Cancelar</a>
          </div>
        </form>
      </div>
    </section>
    ${mpBlock}
    </div>`;

  return wrapAppPage(ctx, "wallet", "Tarjeta de cobro", body);
}
