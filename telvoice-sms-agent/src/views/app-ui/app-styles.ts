import { getOrderUiSharedStyles } from "../shared/order-ui-styles.js";

/** Estilos adicionales del panel cliente /app */
export function getAppPanelStyles(): string {
  return `
    .tv-app-client .tv-sidebar {
      background: linear-gradient(180deg, #0c4a9e 0%, #0a2458 100%);
    }
    .tv-app-client .tv-brand-lockup__sub {
      color: #7dd3fc;
      font-weight: 600;
    }
    .tv-app-client .tv-sidebar__nav {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding: 0.5rem 0.75rem 1rem;
    }
    .tv-app-client .tv-sidebar__nav-group {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .tv-app-client .tv-sidebar__nav-divider {
      height: 1px;
      margin: 0.5rem 0.35rem;
      background: rgba(255, 255, 255, 0.12);
    }
    .tv-app-client .tv-brand-lockup .tv-brand-isotipo {
      width: 38px;
      height: 38px;
    }
    .tv-app-client .tv-nav-link--send {
      background: var(--tv-primary, #0052cc);
      color: #fff;
      font-weight: 500;
    }
    .tv-app-client .tv-nav-link--send .material-symbols-outlined {
      opacity: 1;
    }
    .tv-app-client .tv-nav-link--send:hover {
      background: var(--tv-primary-dark, #003d99);
      color: #fff;
    }
    .tv-app-client .tv-nav-link--send.tv-nav-link--active {
      background: linear-gradient(90deg, rgba(14, 165, 233, 0.35), rgba(91, 33, 182, 0.25));
      color: #fff;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
    }
    .tv-app-client .tv-sidebar__badge {
      display: inline-block;
      margin-top: 0.35rem;
      padding: 0.16rem 0.44rem;
      font-size: 0.544rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: rgba(125, 211, 252, 0.2);
      color: #e0f2fe;
      border-radius: 999px;
      border: 1px solid rgba(125, 211, 252, 0.35);
    }
    .tv-app-client .tv-topbar__search { display: none; }
    .tv-app-client .tv-btn-buy-sms {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.45rem 0.9rem;
      background: linear-gradient(135deg, #0ea5e9, #0052cc);
      color: #fff;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.88rem;
      text-decoration: none;
      border: none;
    }
    .tv-app-client .tv-btn-buy-sms:hover { filter: brightness(1.05); text-decoration: none; }
    .tv-app-client .tv-pill--balance {
      background: rgba(5, 150, 105, 0.12);
      color: #047857;
      font-weight: 600;
    }
    .tv-package-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .tv-package-card {
      background: var(--tv-surface);
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1.25rem;
      box-shadow: var(--tv-shadow);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .tv-package-card__qty {
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--tv-primary);
      letter-spacing: -0.02em;
    }
    .tv-package-card__price {
      font-size: 1.25rem;
      font-weight: 700;
    }
    .tv-package-card__unit {
      color: var(--tv-muted);
      font-size: 0.88rem;
    }
    .tv-quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }
    .tv-coming-soon {
      text-align: center;
      padding: 2.5rem 1.5rem;
      background: var(--tv-surface);
      border: 1px dashed var(--tv-border);
      border-radius: var(--tv-radius);
    }
    .tv-coming-soon .material-symbols-outlined {
      font-size: 2.5rem;
      color: var(--tv-primary);
      opacity: 0.7;
    }
    .tv-no-company {
      max-width: 480px;
      margin: 3rem auto;
      padding: 2rem;
      background: var(--tv-surface);
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow-lg);
      text-align: center;
    }
    .tv-order-success,
    .tv-order-confirm {
      max-width: 640px;
      margin: 1rem 0 2rem;
      padding: 1.5rem;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: var(--tv-radius);
    }
    .tv-order-confirm__title {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      color: #065f46;
    }
    .tv-order-confirm__lead {
      margin: 0;
      color: #047857;
    }
    .tv-order-confirm__dl {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.75rem 1.25rem;
      margin: 1.25rem 0 0;
    }
    .tv-order-confirm__dl dt {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--tv-muted);
      margin: 0;
    }
    .tv-order-confirm__dl dd {
      margin: 0.15rem 0 0;
      font-weight: 600;
    }
    .tv-panel--hint {
      background: #f8fafc;
      border-style: dashed;
    }
    ${getOrderUiSharedStyles()}
    .tv-mobile-preview {
      max-width: 280px;
      margin: 1rem auto;
      padding: 1rem;
      background: #1e293b;
      color: #f8fafc;
      border-radius: 20px;
      font-size: 0.85rem;
      min-height: 120px;
    }
    .alert-warn {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #b45309;
      padding: 0.85rem 1rem;
      border-radius: 10px;
      margin-bottom: 1rem;
    }
    .alert-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 0.85rem 1rem;
      border-radius: 10px;
      margin-bottom: 1rem;
    }
    .tv-mock-sim-banner { font-size: 0.9rem; }
    .tv-cell-truncate { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tv-code-sm { font-size: 0.78rem; }
    .tv-send-disabled-note {
      margin-top: 1rem;
      padding: 0.85rem 1rem;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 10px;
      font-size: 0.9rem;
    }
    .tv-app-send-page {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 1280px;
    }
    .tv-app-send-page .tv-send-main {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 0;
    }
    .tv-app-send-page .tv-page-header {
      margin-bottom: 0;
    }
    .tv-stat-chips--ops {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      margin: 0;
    }
    @media (max-width: 1100px) {
      .tv-stat-chips--ops { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 640px) {
      .tv-stat-chips--ops { grid-template-columns: repeat(2, 1fr); }
    }
    .tv-send-to-row {
      display: grid;
      grid-template-columns: 1fr minmax(9rem, 11rem);
      gap: 0.5rem;
      align-items: stretch;
    }
    .tv-send-to-pick { font-size: 0.85rem; }
    .tv-send-submit { margin-top: 0.5rem; width: 100%; max-width: 280px; }
    .tv-send-result__list {
      margin: 0;
      padding-left: 1.2rem;
      font-size: 0.9rem;
    }
    .tv-checklist {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .tv-checklist__item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      font-size: 0.88rem;
    }
    .tv-checklist__icon { font-size: 1.15rem; flex-shrink: 0; }
    .tv-checklist__item--ok .tv-checklist__icon { color: #059669; }
    .tv-checklist__item--fail .tv-checklist__icon { color: #dc2626; }
    .tv-checklist__hint {
      display: block;
      font-size: 0.78rem;
      color: var(--tv-muted);
      margin-top: 0.1rem;
      word-break: break-all;
    }
    .tv-send-block-reason { color: var(--tv-danger); margin: 0.75rem 0 0; }
    .tv-precampaign-banner--ok {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
      padding: 0.85rem 1rem;
      border-radius: 10px;
      margin: 0;
    }
    .tv-webhook-hint {
      margin-top: 0.75rem;
      word-break: break-all;
      font-size: 0.75rem;
    }
    .tv-webhook-hint--warn { color: #b45309; }
    .tv-verify-section { margin: 0; }
    .tv-telsim-panel__body {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .tv-telsim-panel__select {
      width: 100%;
      align-self: stretch;
    }
    .tv-telsim-panel__phone {
      width: 100%;
      display: flex;
      justify-content: center;
      padding: 0.25rem 0;
      border-radius: 12px;
      transition: box-shadow 0.2s ease;
    }
    .tv-telsim-panel__phone--ready {
      box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.25);
    }
    .tv-telsim-panel__phone--pending {
      box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3);
    }
    .tv-telsim-panel__status {
      margin: 0;
      text-align: center;
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 0.35rem;
    }
    .tv-telsim-panel__form {
      width: 100%;
      display: flex;
      justify-content: center;
    }
    .tv-telsim-panel__btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .tv-telsim-webhook {
      margin-bottom: 0.75rem;
    }
    .tv-copy-row {
      display: flex;
      gap: 0.5rem;
      align-items: stretch;
    }
    .tv-copy-row .tv-input-full {
      flex: 1;
      min-width: 0;
      font-size: 0.8125rem;
    }
    .tv-validation-panel .tv-panel__body {
      padding-top: 0.5rem;
      padding-bottom: 0.75rem;
    }
    .tv-stat-chips--compact {
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
      margin: 0;
    }
    .tv-stat-chips--compact .tv-stat-chip {
      padding: 0.45rem 0.55rem;
    }
    .tv-stat-chips--compact .tv-stat-chip__value {
      font-size: 0.88rem;
    }
    .tv-verify-empty {
      padding: 1.25rem;
      text-align: center;
      color: var(--tv-muted);
    }
    .tv-mass-summary { margin: 0.35rem 0 0; }
    .tv-mass-table-wrap .tv-table--dense { font-size: 0.82rem; }
    .tv-mass-table-wrap .tv-table--dense td,
    .tv-mass-table-wrap .tv-table--dense th { padding: 0.4rem 0.5rem; }
    .tv-mass-table-wrap code { font-size: 0.78rem; }
    @media (max-width: 960px) {
      .tv-send-to-row { grid-template-columns: 1fr; }
      .tv-send-submit { max-width: none; }
    }
  `;
}
