import { canOperateClientPanel } from "../../types/roles.js";
import {
  SMS_BAG_CALC_MAX_VOLUME,
  SMS_BAG_CALC_PANEL_MAX_WIDTH_PX,
  type VolumeTierRange,
} from "../../utils/smsBagCalculator.js";
import type { AppPageContext } from "../app-ui/app-page-wrap.js";

export type SmsBagCalculatorPanelConfig = {
  volumeTierRanges: VolumeTierRange[];
  calcMaxVolume: number;
  ivaRate: number;
};

export function getSmsBagCalculatorStyles(): string {
  return `
    .tv-app-client.tv-app-client--buy-sms .tv-content {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .tv-app-client .tv-buy-sms-page {
      box-sizing: border-box;
      width: min(100%, ${SMS_BAG_CALC_PANEL_MAX_WIDTH_PX}px) !important;
      max-width: ${SMS_BAG_CALC_PANEL_MAX_WIDTH_PX}px !important;
      margin-left: auto !important;
      margin-right: auto !important;
      padding-left: 1rem;
      padding-right: 1rem;
      min-width: 0;
    }
    @media (min-width: 640px) {
      .tv-app-client .tv-buy-sms-page {
        padding-left: 1.5rem;
        padding-right: 1.5rem;
      }
    }
    .tv-app-client .tv-buy-sms-calc {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      margin: 0;
      padding: 0;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    .tv-buy-sms-calc .section-header {
      margin-bottom: 2rem;
      text-align: center;
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .section-header {
        margin-bottom: 2.5rem;
      }
    }
    .tv-buy-sms-calc .section-eyebrow {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #0052cc;
    }
    .tv-buy-sms-calc .calc-hero-title {
      margin: 0.75rem 0 0;
      font-size: clamp(1.35rem, 3.5vw, 2rem);
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: #1a1c20;
    }
    .tv-buy-sms-calc .calc-hero-intro {
      margin: 0.75rem auto 0;
      max-width: 36rem;
      font-size: 1rem;
      line-height: 1.6rem;
      color: #43474e;
      text-align: center;
    }
    .tv-buy-sms-calc .calc-panel {
      margin-top: 2rem;
      border-radius: 1.25rem;
      border: 1px solid rgba(0, 82, 204, 0.1);
      background: #ffffff;
      box-shadow: 0 16px 48px -20px rgba(0, 82, 204, 0.18);
      padding: 1.75rem 1.5rem;
      box-sizing: border-box;
    }
    @media (min-width: 640px) {
      .tv-buy-sms-calc .calc-panel {
        margin-top: 2.5rem;
        padding: 2.5rem 3rem;
      }
    }
    .tv-buy-sms-calc .calc-slider-block {
      padding-bottom: 1.75rem;
      border-bottom: 1px solid #e8ebf4;
      overflow: visible;
    }
    .tv-buy-sms-calc .calc-slider-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      margin-bottom: 1.25rem;
    }
    .tv-buy-sms-calc .calc-slider-label {
      font-size: 0.9375rem;
      font-weight: 600;
      color: #1a1c20;
    }
    .tv-buy-sms-calc .calc-vol-display {
      font-size: clamp(1.5rem, 4vw, 2rem);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: #0052cc;
      white-space: nowrap;
    }
    .tv-buy-sms-calc .calc-range-input {
      width: 100%;
      -webkit-appearance: none;
      appearance: none;
      height: 8px;
      border-radius: 9999px;
      outline: none;
      background: linear-gradient(to right, #0052cc 0%, #c3c6d6 0%);
    }
    .tv-buy-sms-calc .calc-range-input::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #0052cc;
      cursor: grab;
      box-shadow: 0 0 0 4px rgba(0, 82, 204, 0.2);
      border: 2px solid #faf8ff;
      margin-top: -7px;
    }
    .tv-buy-sms-calc .calc-range-input::-moz-range-thumb {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #0052cc;
      cursor: grab;
      border: 2px solid #faf8ff;
      box-shadow: 0 0 0 4px rgba(0, 82, 204, 0.2);
    }
    .tv-buy-sms-calc .calc-tier-chips {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.45rem 0.35rem;
      width: 100%;
      margin-top: 1rem;
      overflow: visible;
    }
    .tv-buy-sms-calc .calc-tier-chip {
      display: flex;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.1rem;
      min-height: 2.35rem;
      padding: 0.35rem 0.2rem;
      border-radius: 0.625rem;
      border: 1px solid rgba(0, 82, 204, 0.18);
      background: #f4f7fc;
      font-size: 0.625rem;
      font-weight: 600;
      line-height: 1.12;
      text-align: center;
      color: #43474e;
      white-space: normal;
      word-break: break-word;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .calc-tier-chips {
        display: flex;
        flex-wrap: nowrap;
        justify-content: space-between;
        gap: 0.18rem;
      }
      .tv-buy-sms-calc .calc-tier-chip {
        display: inline-flex;
        flex: 1 1 0;
        width: auto;
        min-width: 0;
        max-width: none;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 0.08rem;
        min-height: 1.5rem;
        padding: 0.2rem 0.22rem;
        border-radius: 9999px;
        font-size: 0.625rem;
        white-space: nowrap;
        letter-spacing: -0.02em;
      }
    }
    @media (min-width: 1024px) {
      .tv-buy-sms-calc .calc-tier-chips {
        gap: 0.22rem;
      }
      .tv-buy-sms-calc .calc-tier-chip {
        font-size: 0.65rem;
        padding: 0.22rem 0.28rem;
      }
    }
    .tv-buy-sms-calc .calc-tier-chip:hover {
      border-color: rgba(0, 82, 204, 0.35);
      color: #0052cc;
      background: #eef3ff;
    }
    .tv-buy-sms-calc .calc-tier-chip.is-active {
      border-color: #0052cc;
      background: #0052cc;
      color: #ffffff;
      box-shadow: 0 4px 14px -4px rgba(0, 82, 204, 0.45);
    }
    .tv-buy-sms-calc .calc-tier-chip-sub {
      margin: 0;
      font-size: 0.5625rem;
      font-weight: 600;
      opacity: 0.85;
      line-height: 1.1;
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .calc-tier-chip-sub {
        margin-left: 0.1rem;
        font-size: 0.5625rem;
        opacity: 0.9;
      }
    }
    .tv-buy-sms-calc .calc-tier-chip:not(.is-active) .calc-tier-chip-sub {
      color: #5c6478;
    }
    .tv-buy-sms-calc .calc-result-panel {
      margin-top: 1.75rem;
      border-radius: 1rem;
      border: 1px solid #e2e7ff;
      background: linear-gradient(180deg, #f8f9ff 0%, #ffffff 100%);
      padding: 1.25rem 1.25rem 1rem;
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .calc-result-panel {
        padding: 1.5rem 1.75rem 1.25rem;
      }
    }
    .tv-buy-sms-calc .calc-result-grid {
      display: grid;
      gap: 1.5rem;
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .calc-result-grid {
        grid-template-columns: 1fr minmax(12rem, 16rem);
        align-items: end;
        gap: 2rem;
      }
    }
    .tv-buy-sms-calc .calc-result-dl {
      display: grid;
      gap: 1rem;
    }
    .tv-buy-sms-calc .calc-result-row-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #5c6478;
    }
    .tv-buy-sms-calc .calc-result-row-value {
      display: block;
      margin-top: 0.25rem;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.35;
      color: #1a1c20;
    }
    .tv-buy-sms-calc .calc-result-total-wrap { text-align: left; }
    @media (max-width: 767px) {
      .tv-buy-sms-calc .calc-result-dl {
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem 0.5rem;
      }
      .tv-buy-sms-calc .calc-result-row-label {
        font-size: 0.625rem;
        letter-spacing: 0.03em;
      }
      .tv-buy-sms-calc .calc-result-row-value {
        margin-top: 0.15rem;
        font-size: 0.875rem;
      }
      .tv-buy-sms-calc .calc-result-total-wrap {
        text-align: right;
        margin-top: 0.75rem;
      }
      .tv-buy-sms-calc .calc-result-total-value {
        font-size: clamp(1.5rem, 6vw, 1.75rem);
      }
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .calc-result-total-wrap { text-align: right; }
    }
    .tv-buy-sms-calc .calc-result-total-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #5c6478;
    }
    .tv-buy-sms-calc .calc-result-total-value {
      display: block;
      margin-top: 0.35rem;
      font-size: clamp(1.75rem, 4vw, 2.25rem);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: #0052cc;
      white-space: nowrap;
    }
    .tv-buy-sms-calc .calc-result-note {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e8ebf4;
      font-size: 0.8125rem;
      line-height: 1.5;
      color: #5c6478;
    }
    .tv-buy-sms-calc .calc-footnote {
      margin-top: 1.25rem;
      max-width: 100%;
      padding-left: 0.5rem;
      padding-right: 0.5rem;
      text-align: center;
      font-size: 0.75rem;
      line-height: 1.4;
      color: #5c6478;
    }
    @media (min-width: 640px) {
      .tv-buy-sms-calc .calc-footnote { font-size: 0.8125rem; }
    }
    .tv-buy-sms-calc .pack-includes-block {
      margin-top: 2rem;
      max-width: 100%;
      margin-left: auto;
      margin-right: auto;
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .pack-includes-block { margin-top: 2.5rem; }
    }
    .tv-buy-sms-calc .pack-includes-title {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #1a1c20;
      text-align: center;
      margin: 0 0 0.75rem;
    }
    .tv-buy-sms-calc .pack-includes {
      border: 1px solid rgba(0, 82, 204, 0.12);
      background: linear-gradient(180deg, #faf8ff 0%, #f5f7fc 100%);
      border-radius: 1.25rem;
      padding: 1rem 0.85rem;
      overflow: hidden;
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .pack-includes {
        padding: 1.15rem 1.25rem;
      }
    }
    .tv-buy-sms-calc .pack-includes-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      justify-content: center;
      align-items: center;
      gap: clamp(0.35rem, 1.1vw, 0.85rem);
      width: 100%;
      max-width: 100%;
    }
    @media (min-width: 768px) {
      .tv-buy-sms-calc .pack-includes-list {
        gap: clamp(0.5rem, 1.4vw, 1.15rem);
      }
    }
    .tv-buy-sms-calc .pack-includes-item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.28rem;
      font-size: clamp(0.625rem, 1.75vw, 0.75rem);
      line-height: 1.25;
      color: #43474e;
      white-space: nowrap;
      flex: 0 1 auto;
      min-width: 0;
      text-align: center;
    }
    .tv-buy-sms-calc .pack-includes-item .material-symbols-outlined {
      font-size: clamp(0.75rem, 2vw, 0.9375rem);
      color: #0052cc;
      flex-shrink: 0;
    }
    .tv-buy-sms-calc .calc-cta-wrap {
      margin-top: 1.75rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      text-align: center;
    }
    .tv-buy-sms-calc .calc-cta-actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.65rem;
      width: 100%;
    }
    .tv-buy-sms-calc .calc-cta-actions form {
      width: 100%;
      max-width: 100%;
      margin: 0;
    }
    .tv-buy-sms-calc .calc-cta-btn {
      width: 100%;
      max-width: 22rem;
      border: 0;
      border-radius: 9999px;
      padding: 1rem 2.5rem;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.25;
      cursor: pointer;
      transition: filter 0.2s ease, background-color 0.2s ease;
    }
    .tv-buy-sms-calc .calc-cta-btn--mp {
      width: 100%;
      max-width: 100%;
      white-space: nowrap;
      font-size: clamp(0.8125rem, 2.4vw, 1rem);
      padding: 1rem 1.5rem;
    }
    @media (min-width: 640px) {
      .tv-buy-sms-calc .calc-cta-btn {
        width: auto;
        min-width: 16rem;
      }
    }
    .tv-buy-sms-calc .calc-cta-btn--primary {
      background: #0052cc;
      color: #fff;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
    }
    .tv-buy-sms-calc .calc-cta-btn--primary:hover:not(:disabled) {
      background: #0040a2;
    }
    .tv-buy-sms-calc .calc-cta-btn--secondary {
      background: #fff;
      color: #0052cc;
      border: 1px solid rgba(0, 82, 204, 0.25);
      box-shadow: none;
    }
    .tv-buy-sms-calc .calc-cta-btn--secondary:hover:not(:disabled) {
      background: #eef3ff;
    }
    .tv-buy-sms-calc .calc-cta-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .tv-buy-sms-calc .calc-cta-link {
      display: inline-block;
      margin-top: 0.25rem;
      font-size: 0.9375rem;
      font-weight: 500;
      color: #0052cc;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .tv-buy-sms-calc .calc-cta-link:hover { color: #0040a2; }
    .tv-buy-sms-calc .calc-cta-note {
      margin: 0;
      max-width: 22rem;
      font-size: 0.75rem;
      line-height: 1.4;
      color: #5c6478;
    }
    .tv-buy-sms-calc .calc-readonly-note {
      margin: 0;
      font-size: 0.88rem;
      color: #64748b;
      text-align: center;
    }
    .tv-buy-sms-calc .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `;
}

function serializeCalcConfig(config: SmsBagCalculatorPanelConfig): string {
  return JSON.stringify(config).replace(/</g, "\\u003c");
}

export type SmsBagCalculatorPanelOptions = {
  mercadoPagoAvailable: boolean;
  manualCheckoutEnabled: boolean;
  smsSubscription?: import("../../types/sms-mp-subscription.js").CompanySmsMpSubscription | null;
};

export function renderSmsBagCalculatorPanel(
  ctx: AppPageContext,
  config: SmsBagCalculatorPanelConfig,
  options: SmsBagCalculatorPanelOptions,
): string {
  const canBuy = canOperateClientPanel(ctx.profile.role);
  const mpAvailable = options.mercadoPagoAvailable;
  const manualEnabled = options.manualCheckoutEnabled;

  const configJson = serializeCalcConfig(config);
  const maxLabel = new Intl.NumberFormat("es-CL").format(config.calcMaxVolume);

  const mpButton =
    canBuy && mpAvailable
      ? `<form method="post" action="/app/buy-sms/mercadopago" id="tv-buy-calc-mp-form">
        <input type="hidden" name="sms_quantity" id="tv-buy-calc-mp-qty" value="1000" />
        <button type="submit" class="calc-cta-btn calc-cta-btn--primary calc-cta-btn--mp" id="tv-buy-calc-mp-btn">
          Pagar con Mercado Pago
        </button>
      </form>`
      : canBuy
        ? `<button type="button" class="calc-cta-btn calc-cta-btn--primary calc-cta-btn--mp" disabled title="Mercado Pago no disponible">
          Pagar con Mercado Pago
        </button>`
        : "";

  const manualButton = canBuy
    ? manualEnabled
      ? `<form method="post" action="/app/buy-sms" id="tv-buy-calc-manual-form">
        <input type="hidden" name="sms_quantity" id="tv-buy-calc-manual-qty" value="1000" />
        <button type="submit" class="calc-cta-btn calc-cta-btn--secondary" id="tv-buy-calc-manual-btn">
          Solicitar pago manual
        </button>
      </form>`
      : `<button type="button" class="calc-cta-btn calc-cta-btn--secondary" id="tv-buy-calc-manual-btn" disabled title="El pago manual aún no está disponible">
          Solicitar pago manual
        </button>`
    : `<p class="calc-readonly-note">Tu rol es solo lectura. Contacta al administrador de la cuenta para comprar SMS.</p>`;

  const mpNote = mpAvailable
    ? `<p class="calc-cta-note">Pago con Mercado Pago. El saldo se acredita cuando el webhook confirma el cargo aprobado.</p>`
    : `<p class="calc-cta-note">Mercado Pago no está configurado. Contacta a soporte para completar tu compra.</p>`;

  return `<section class="tv-buy-sms-calc" aria-labelledby="tv-buy-calc-title">
      <header class="section-header">
        <span class="section-eyebrow">Arma tu bolsa</span>
        <h2 id="tv-buy-calc-title" class="calc-hero-title">Bolsas SMS para cada etapa de tu empresa.</h2>
        <p class="calc-hero-intro">Selecciona la cantidad de SMS que necesitas y conoce el valor estimado según el tramo.</p>
      </header>
      <div class="calc-panel">
        <div class="calc-slider-block">
          <div class="calc-slider-head">
            <span class="calc-slider-label">Cantidad de SMS</span>
            <span id="tvCalcVol" class="calc-vol-display" aria-live="polite">1.000 SMS</span>
          </div>
          <label for="tvCalcSlider" class="sr-only">Cantidad de SMS</label>
          <input id="tvCalcSlider" class="calc-range-input" type="range" min="0" max="109" step="1" value="0" aria-valuemin="1000" aria-valuemax="${config.calcMaxVolume}" aria-valuenow="1000" />
          <div id="tvCalcSliderSuggestions" class="calc-tier-chips" role="group" aria-label="Cantidades sugeridas por tramo de precio"></div>
        </div>
        <div class="calc-result-panel" aria-live="polite">
          <div class="calc-result-grid">
            <div class="calc-result-dl">
              <div class="calc-result-row">
                <span class="calc-result-row-label">Cantidad seleccionada</span>
                <span id="tvCalcQty" class="calc-result-row-value">1.000 SMS</span>
              </div>
              <div class="calc-result-row">
                <span class="calc-result-row-label">Valor unitario</span>
                <span id="tvCalcPxSMS" class="calc-result-row-value">$10 + IVA por SMS</span>
              </div>
            </div>
            <div class="calc-result-total-wrap">
              <span class="calc-result-total-label">Total estimado (IVA incl.)</span>
              <strong id="tvCalcTotal" class="calc-result-total-value">$11.900</strong>
            </div>
          </div>
          <p class="calc-result-note">Monto total en CLP con IVA incluido, según cantidad y tramo de precio unitario.</p>
        </div>
        <p class="calc-footnote">El cálculo es referencial según los tramos vigentes. Hasta ${maxLabel} SMS puedes comprar online desde aquí.</p>
        <div class="pack-includes-block">
          <p class="pack-includes-title">Todas las bolsas incluyen</p>
          <div class="pack-includes">
            <ul class="pack-includes-list">
              <li class="pack-includes-item"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span> Plataforma web para gestión de envíos</li>
              <li class="pack-includes-item"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span> Reportería de campañas</li>
              <li class="pack-includes-item"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span> Acceso API sujeto a solicitud</li>
            </ul>
          </div>
        </div>
        <div class="calc-cta-wrap">
          <div class="calc-cta-actions">${mpButton}${manualButton}</div>
          ${mpNote}
          <p style="margin:0.75rem 0 0">
            <a href="/app/support" class="calc-cta-link">¿Necesitas más de ${maxLabel} SMS? Cotiza con soporte</a>
          </p>
        </div>
      </div>
  </section>
  <script>
  (function () {
    var CFG = ${configJson};
    var tiers = CFG.volumeTierRanges || [];
    var maxVol = CFG.calcMaxVolume || ${SMS_BAG_CALC_MAX_VOLUME};
    var ivaRate = CFG.ivaRate != null ? CFG.ivaRate : 0.19;
    function fmt(n) { return new Intl.NumberFormat("es-CL").format(n); }
    function buildVolumes() {
      var list = [], v;
      for (v = 1000; v <= 90000; v += 1000) list.push(v);
      for (v = 100000; v <= maxVol; v += 1000) list.push(v);
      return list;
    }
    var CALC_VOLUMES = buildVolumes();
    function snapCalcVolume(vol) {
      var v = Math.round(+vol);
      if (v < 1000) return 1000;
      v = Math.round(v / 1000) * 1000;
      if (v < 1000) return 1000;
      if (v > maxVol) return maxVol;
      if (v > 90000 && v < 100000) return 100000;
      return v;
    }
    function volumeToSliderIndex(vol) {
      var v = snapCalcVolume(vol);
      var idx = CALC_VOLUMES.indexOf(v);
      if (idx >= 0) return idx;
      if (v <= 90000) return Math.max(0, v / 1000 - 1);
      return 90 + (v / 1000 - 100);
    }
    function sliderIndexToVolume(idx) {
      var i = Math.max(0, Math.min(CALC_VOLUMES.length - 1, Math.round(+idx)));
      return CALC_VOLUMES[i];
    }
    function findCalcTier(vol) {
      var v = snapCalcVolume(vol);
      for (var i = 0; i < tiers.length; i++) {
        var t = tiers[i];
        if (v >= t.min && v <= t.max) return t;
      }
      return null;
    }
    function formatMoney(n) { return "$" + fmt(Math.round(n)); }
    function formatTotalWithIva(net) { return formatMoney(net * (1 + ivaRate)); }
    function tierSuggestions() {
      var out = [];
      tiers.forEach(function (tier, i) {
        if (i === 0 || tier.pxSMS !== tiers[i - 1].pxSMS) out.push({ vol: tier.min, pxSMS: tier.pxSMS });
      });
      return out;
    }
    var slider = document.getElementById("tvCalcSlider");
    if (!slider) return;
    var calcVol = document.getElementById("tvCalcVol");
    var calcQty = document.getElementById("tvCalcQty");
    var calcPxSMS = document.getElementById("tvCalcPxSMS");
    var calcTotal = document.getElementById("tvCalcTotal");
    var suggestionsEl = document.getElementById("tvCalcSliderSuggestions");
    var mpQty = document.getElementById("tv-buy-calc-mp-qty");
    var manualQty = document.getElementById("tv-buy-calc-manual-qty");
    var mpBtn = document.getElementById("tv-buy-calc-mp-btn");
    var sliderMax = CALC_VOLUMES.length - 1;
    function setSliderProgress() {
      var idx = +slider.value;
      var pct = sliderMax > 0 ? (idx / sliderMax) * 100 : 0;
      slider.style.background = "linear-gradient(to right, #0052cc " + pct + "%, rgba(56, 189, 248, 0.15) " + pct + "%)";
    }
    function syncHiddenQty(vol) {
      if (mpQty) mpQty.value = String(vol);
      if (manualQty) manualQty.value = String(vol);
    }
    function updateCalc() {
      var vol = sliderIndexToVolume(slider.value);
      var idx = volumeToSliderIndex(vol);
      if (+slider.value !== idx) slider.value = String(idx);
      slider.setAttribute("aria-valuenow", String(vol));
      if (calcVol) calcVol.textContent = fmt(vol) + " SMS";
      setSliderProgress();
      var tier = findCalcTier(vol);
      if (!tier) return;
      var net = vol * tier.pxSMS;
      var iva = Math.round(net * ivaRate);
      if (calcQty) calcQty.textContent = fmt(vol) + " SMS";
      if (calcPxSMS) calcPxSMS.textContent = "$" + tier.pxSMS + " + IVA por SMS";
      if (calcTotal) calcTotal.textContent = formatMoney(net + iva);
      if (mpBtn) mpBtn.textContent = "Pagar " + fmt(vol) + " SMS con Mercado Pago";
      syncHiddenQty(vol);
      if (suggestionsEl) {
        suggestionsEl.querySelectorAll(".calc-tier-chip").forEach(function (btn) {
          var match = +btn.getAttribute("data-volume") === vol;
          btn.classList.toggle("is-active", match);
          btn.setAttribute("aria-pressed", match ? "true" : "false");
        });
      }
    }
    if (suggestionsEl) {
      tierSuggestions().forEach(function (item) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "calc-tier-chip";
        btn.setAttribute("data-volume", String(item.vol));
        btn.setAttribute("aria-pressed", "false");
        btn.appendChild(document.createTextNode(fmt(item.vol) + " SMS"));
        var sub = document.createElement("span");
        sub.className = "calc-tier-chip-sub";
        sub.textContent = "$" + item.pxSMS;
        btn.appendChild(sub);
        btn.addEventListener("click", function () {
          slider.value = String(volumeToSliderIndex(item.vol));
          updateCalc();
        });
        suggestionsEl.appendChild(btn);
      });
    }
    slider.addEventListener("input", updateCalc);
    updateCalc();
  })();
  </script>`;
}
