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
    .tv-app-client .tv-nav-send-cta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 0.25rem 0 0.65rem;
      padding: 0.85rem 1rem;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 700;
      font-size: 0.95rem;
      color: #0a2458;
      background: linear-gradient(135deg, #fef08a 0%, #facc15 45%, #38bdf8 100%);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.35);
      transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
    }
    .tv-app-client .tv-nav-send-cta:hover {
      text-decoration: none;
      color: #0a2458;
      transform: translateY(-1px);
      filter: brightness(1.03);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    }
    .tv-app-client .tv-nav-send-cta--active {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .tv-app-client .tv-nav-send-cta__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 10px;
      background: rgba(10, 36, 88, 0.12);
    }
    .tv-app-client .tv-nav-send-cta__icon .material-symbols-outlined {
      font-size: 1.35rem;
      color: #0a2458;
    }
    .tv-app-client .tv-nav-send-cta__label {
      flex: 1;
      letter-spacing: -0.01em;
    }
    .tv-app-client .tv-sidebar__badge {
      display: inline-block;
      margin-top: 0.35rem;
      padding: 0.2rem 0.55rem;
      font-size: 0.68rem;
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
  `;
}
