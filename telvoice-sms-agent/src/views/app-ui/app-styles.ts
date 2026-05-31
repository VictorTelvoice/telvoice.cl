import { getOrderUiSharedStyles } from "../shared/order-ui-styles.js";
import { getSmsBagCalculatorStyles } from "../shared/sms-bag-calculator-ui.js";

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
      width: 32px;
      height: 32px;
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
    .tv-app-send-page .tv-send-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 200px;
      gap: 1rem;
      align-items: start;
    }
    .tv-app-send-page .tv-send-main {
      position: relative;
      z-index: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .tv-app-send-page .tv-send-aside {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      width: 200px;
      min-width: 200px;
      max-width: 200px;
      flex-shrink: 0;
      position: sticky;
      top: 0.75rem;
      align-self: start;
    }
    .tv-message-locked .tv-template-btn,
    .tv-message-locked .tv-var-chip {
      opacity: 0.45;
      pointer-events: none;
    }
    .tv-input-readonly-locked {
      cursor: not-allowed;
      background: #f1f5f9;
      color: var(--tv-muted);
    }
    .tv-campaign-detail-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1rem;
      margin-top: 1rem;
      align-items: start;
    }
    .tv-campaign-detail-cell--full {
      grid-column: 1 / -1;
    }
    @media (max-width: 1100px) {
      .tv-campaign-detail-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 720px) {
      .tv-campaign-detail-grid {
        grid-template-columns: 1fr;
      }
    }
    .tv-campaign-detail-grid + .tv-campaign-detail-cell--full {
      margin-top: 1rem;
    }
    .tv-send-preview-phone {
      display: flex;
      justify-content: center;
      flex-shrink: 0;
      width: 200px;
      min-width: 200px;
      max-width: 200px;
      padding: 0;
      margin: 0;
      background: none;
      border: none;
      box-shadow: none;
    }
    /* Mockup hero: tamaño fijo para que no se deforme al actualizar el mensaje */
    .tv-send-preview-phone .tv-hero-phone {
      box-sizing: border-box;
      flex-shrink: 0;
      width: 200px;
      min-width: 200px;
      max-width: 200px;
      height: 370px;
      min-height: 370px;
      max-height: 370px;
      border-radius: 31px;
      border-width: 8px;
      box-shadow: 0 16px 38px -10px rgba(15, 23, 42, 0.28);
    }
    .tv-send-preview-phone .tv-hero-phone__notch {
      height: 17px;
      border-radius: 0 0 11px 11px;
    }
    .tv-send-preview-phone .tv-hero-phone__screen {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 1.9rem 0.75rem 0.75rem;
    }
    .tv-send-preview-phone .tv-hero-phone__app-head {
      flex-shrink: 0;
      gap: 0.5rem;
      padding-bottom: 0.55rem;
      margin-bottom: 0.4rem;
      min-width: 0;
    }
    .tv-send-preview-phone .tv-hero-phone__app-head > div:last-child {
      min-width: 0;
      overflow: hidden;
    }
    .tv-send-preview-phone .tv-hero-phone__app-title,
    .tv-send-preview-phone .tv-hero-phone__app-sub {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tv-send-preview-phone .tv-hero-phone__avatar {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      font-size: 0.72rem;
    }
    .tv-send-preview-phone .tv-hero-phone__app-title {
      font-size: 0.64rem;
    }
    .tv-send-preview-phone .tv-hero-phone__app-sub {
      font-size: 0.53rem;
    }
    .tv-send-preview-phone .tv-hero-phone__messages {
      flex: 1;
      min-height: 0;
      gap: 0.4rem;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .tv-send-preview-phone .tv-hero-phone__bubble {
      flex-shrink: 0;
      max-width: 100%;
      padding: 0.5rem 0.58rem;
      font-size: 0.58rem;
      line-height: 1.45;
      border-radius: 12px;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .tv-send-preview-phone .tv-hero-phone__bubble--in {
      border-radius: 12px 12px 12px 3px;
    }
    .tv-send-validation {
      box-sizing: border-box;
      width: 200px;
      min-width: 200px;
      max-width: 200px;
      flex-shrink: 0;
      padding: 0.4rem 0.35rem;
      background: var(--tv-surface, #fff);
      border: 1px solid var(--tv-border, #e2e8f0);
      border-radius: 10px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .tv-stat-chips--send-aside {
      grid-template-columns: 1fr 1fr;
      gap: 0.3rem;
      margin: 0;
    }
    .tv-stat-chips--send-aside .tv-stat-chip {
      padding: 0.3rem 0.4rem;
      min-height: 0;
    }
    .tv-stat-chips--send-aside .tv-stat-chip__label {
      font-size: 0.62rem;
      line-height: 1.2;
    }
    .tv-stat-chips--send-aside .tv-stat-chip {
      min-width: 0;
      overflow: hidden;
    }
    .tv-stat-chips--send-aside .tv-stat-chip__value {
      font-size: 0.75rem;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 960px) {
      .tv-app-send-page .tv-send-layout {
        grid-template-columns: 1fr;
      }
      .tv-app-send-page .tv-send-aside {
        position: static;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: center;
        max-width: none;
      }
      .tv-send-validation {
        max-width: min(320px, 100%);
        flex: 1 1 200px;
      }
    }
    .tv-hero-phone {
      position: relative;
      width: min(260px, 100%);
      height: 480px;
      margin: 0 auto;
      background: #1e293b;
      border-radius: 40px;
      border: 10px solid #cbd5e1;
      box-shadow: 0 20px 50px -15px rgba(15, 23, 42, 0.35);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .tv-hero-phone__notch {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 36%;
      height: 22px;
      background: #cbd5e1;
      border-radius: 0 0 14px 14px;
      z-index: 2;
    }
    .tv-hero-phone__screen {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #f8fafc;
      padding: 2.5rem 1rem 1rem;
      overflow: hidden;
    }
    .tv-hero-phone__app-head {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding-bottom: 0.75rem;
      margin-bottom: 0.5rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.35);
    }
    .tv-hero-phone__avatar {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0ea5e9, #0052cc);
      color: #fff;
      font-weight: 800;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .tv-hero-phone__app-title {
      font-size: 0.82rem;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }
    .tv-hero-phone__app-sub {
      font-size: 0.68rem;
      color: #64748b;
      margin-top: 0.1rem;
    }
    .tv-hero-phone__messages {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      overflow-y: auto;
      padding-top: 0.25rem;
    }
    .tv-hero-phone__bubble {
      max-width: 88%;
      padding: 0.65rem 0.75rem;
      font-size: 0.75rem;
      line-height: 1.45;
      border-radius: 16px;
      word-break: break-word;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    .tv-hero-phone__bubble--in {
      align-self: flex-start;
      background: #e2e8f0;
      color: #0f172a;
      border-radius: 16px 16px 16px 4px;
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
    .tv-send-outcome {
      margin: 0;
    }
    .tv-send-confirm-modal {
      position: fixed;
      inset: 0;
      z-index: 220;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .tv-send-confirm-modal[aria-hidden="true"] { display: none; }
    .tv-send-confirm-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.48);
    }
    .tv-send-confirm-modal__panel {
      position: relative;
      width: min(480px, 100%);
      max-height: min(90vh, 640px);
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 20px 40px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.06);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: tv-send-confirm-in 0.24s ease-out;
    }
    @keyframes tv-send-confirm-in {
      from { opacity: 0; transform: translateY(10px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .tv-send-confirm-modal__close {
      position: absolute;
      top: 0.6rem;
      right: 0.6rem;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
    }
    .tv-send-confirm-modal__close:hover {
      background: #f1f5f9;
      color: #334155;
    }
    .tv-send-confirm-modal__close .material-symbols-outlined {
      font-size: 1.25rem;
    }
    .tv-send-confirm-modal__hero {
      padding: 1.35rem 1.5rem 1rem;
      text-align: center;
      background: #ffffff;
      border-bottom: 1px solid #eef2f7;
    }
    .tv-send-confirm-modal__icon-wrap {
      width: 2.75rem;
      height: 2.75rem;
      margin: 0 auto 0.65rem;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tv-send-confirm-modal__icon-wrap--queued,
    .tv-send-confirm-modal__icon-wrap--success {
      background: #ecfdf5;
      color: #059669;
    }
    .tv-send-confirm-modal__icon-wrap--scheduled {
      background: #eff6ff;
      color: #0052cc;
    }
    .tv-send-confirm-modal__icon {
      font-size: 1.5rem;
      font-variation-settings: "FILL" 1, "wght" 500;
    }
    .tv-send-confirm-modal__title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #1a1c20;
    }
    .tv-send-confirm-modal__subtitle {
      margin: 0.4rem 0 0;
      font-size: 0.875rem;
      color: #5c6478;
      line-height: 1.5;
      max-width: 26rem;
      margin-left: auto;
      margin-right: auto;
    }
    .tv-send-confirm-modal__hint {
      margin: 0.5rem 0 0;
      font-size: 0.8125rem;
      color: #0052cc;
      line-height: 1.4;
    }
    .tv-send-confirm-modal__body {
      padding: 1rem 1.25rem 0.75rem;
      overflow-y: auto;
    }
    .tv-send-confirm-modal__stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.5rem;
      margin-bottom: 0.85rem;
    }
    .tv-send-confirm-modal__stats--3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    @media (max-width: 520px) {
      .tv-send-confirm-modal__stats,
      .tv-send-confirm-modal__stats--3 {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .tv-send-confirm-stat {
      padding: 0.65rem 0.45rem;
      border: 1px solid #e8ebf4;
      border-radius: 10px;
      background: #fafbfc;
      text-align: center;
    }
    .tv-send-confirm-stat--accent {
      border-color: rgba(0, 82, 204, 0.15);
      background: #f4f7fc;
    }
    .tv-send-confirm-stat__value {
      display: block;
      font-size: 1.05rem;
      font-weight: 700;
      color: #1a1c20;
      line-height: 1.2;
      word-break: break-word;
    }
    .tv-send-confirm-stat--accent .tv-send-confirm-stat__value {
      color: #0052cc;
    }
    .tv-send-confirm-stat__label {
      display: block;
      margin-top: 0.15rem;
      font-size: 0.68rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #5c6478;
    }
    .tv-send-confirm-modal__meta {
      margin: 0;
      padding: 0.65rem 0.75rem;
      border-radius: 10px;
      border: 1px solid #e8ebf4;
      background: #f8fafc;
    }
    .tv-send-confirm-meta-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.35rem 0;
      font-size: 0.8125rem;
    }
    .tv-send-confirm-meta-row:not(:last-child) {
      border-bottom: 1px solid rgba(15, 23, 42, 0.05);
    }
    .tv-send-confirm-meta-row dt {
      margin: 0;
      font-weight: 600;
      color: #5c6478;
    }
    .tv-send-confirm-meta-row dd {
      margin: 0;
      text-align: right;
      color: #1a1c20;
      font-weight: 500;
    }
    .tv-send-confirm-modal__ops-note {
      margin: 0.75rem 0 0;
      padding: 0.65rem 0.75rem;
      border-radius: 10px;
      background: #f4f7fc;
      border: 1px solid rgba(0, 82, 204, 0.1);
      font-size: 0.8125rem;
      color: #43474e;
      line-height: 1.5;
    }
    .tv-send-confirm-modal__lead {
      margin: 0;
      font-size: 0.875rem;
      color: #1a1c20;
      line-height: 1.5;
    }
    .tv-send-confirm-modal__foot {
      padding: 0.85rem 1.25rem 1.1rem;
      border-top: 1px solid #eef2f7;
      background: #fafbfc;
    }
    .tv-send-confirm-modal__foot-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    @media (max-width: 480px) {
      .tv-send-confirm-modal__foot-actions {
        flex-direction: column;
        align-items: stretch;
      }
      .tv-send-confirm-modal__foot-btn {
        width: 100%;
        justify-content: center;
      }
    }
    .tv-send-confirm-modal__foot-btn--primary {
      min-width: 7.5rem;
    }
    .tv-send-confirm-modal__head {
      display: none;
    }
    .tv-send-confirm-modal__links { margin: 0.85rem 0 0; }
    .tv-send-outcome__lead {
      margin: 0.35rem 0 0;
      font-size: 0.92rem;
      color: #065f46;
      line-height: 1.45;
    }
    .tv-send-outcome--flash {
      margin: 0;
    }
    .tv-send-outcome--flash .alert {
      margin: 0;
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
    .tv-send-meta-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem 1rem;
      align-items: start;
    }
    .tv-send-contacts-pick { font-size: 0.85rem; }
    @media (max-width: 720px) {
      .tv-send-meta-row { grid-template-columns: 1fr; }
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
    .tv-client-dashboard {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
      max-width: none;
    }
    .tv-client-dash-alert {
      margin: 0;
    }
    .tv-kpi-grid--client {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      margin-bottom: 0;
      gap: 1rem;
    }
    .tv-kpi-grid--client .tv-kpi {
      min-height: 128px;
      padding: 1.25rem 1.35rem 1.3rem;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }
    .tv-kpi-grid--client .tv-kpi__head {
      margin-bottom: 0.7rem;
      gap: 0.45rem;
    }
    .tv-kpi-grid--client .tv-kpi__label {
      line-height: 1.25;
    }
    .tv-kpi-grid--client .tv-kpi__value {
      line-height: 1.15;
      margin-top: 0;
    }
    .tv-kpi-grid--client .tv-kpi__hint {
      margin-top: 0.5rem;
      line-height: 1.35;
    }
    .tv-dash-block {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .tv-dash-block__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0 0.15rem;
    }
    .tv-dash-block__title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--tv-text);
    }
    .tv-dash-block__link {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--tv-primary);
      text-decoration: none;
      white-space: nowrap;
    }
    .tv-dash-block__link:hover {
      text-decoration: underline;
    }
    .tv-dash-charts {
      width: 100%;
    }
    .tv-dash-charts__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.25rem;
      width: 100%;
    }
    .tv-dash-charts__card {
      padding: 0;
      overflow: hidden;
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow);
    }
    .tv-dash-charts__head {
      padding: 1.1rem 1.25rem 0;
    }
    .tv-dash-charts__title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--tv-text);
    }
    .tv-dash-charts__sub {
      margin: 0.3rem 0 0;
      font-size: 0.82rem;
      color: var(--tv-muted);
    }
    .tv-dash-charts__body {
      padding: 1rem 1.25rem 1.25rem;
    }
    .tv-dash-charts__body--bars {
      padding-bottom: 0.75rem;
    }
    .tv-chart--dashboard {
      height: 220px;
      align-items: stretch;
      gap: 0.4rem;
      padding-top: 0.25rem;
      position: relative;
      padding-bottom: 1.5rem;
    }
    .tv-chart--dashboard .tv-chart__col {
      min-height: 0;
    }
    .tv-chart--dashboard .tv-chart__bar-wrap {
      max-width: 56px;
    }
    .tv-chart--dashboard .tv-chart__bar {
      background: linear-gradient(180deg, #60a5fa, var(--tv-primary, #0052cc));
      min-height: 0;
      border-radius: 8px 8px 4px 4px;
    }
    .tv-chart--dashboard .tv-chart__col--has-value .tv-chart__bar {
      min-height: 10px;
    }
    .tv-chart--dashboard .tv-chart__label {
      font-size: 0.72rem;
      font-weight: 600;
      line-height: 1.2;
    }
    .tv-chart--dashboard .tv-chart__val {
      font-size: 0.8rem;
      color: var(--tv-primary, #0052cc);
    }
    .tv-chart--dashboard__scale {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      margin: 0;
      text-align: center;
      font-size: 0.72rem;
    }
    .tv-dash-chart-empty {
      padding: 2rem 1rem;
      text-align: center;
      font-size: 0.88rem;
      color: var(--tv-muted);
    }
    .tv-dash-pie {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
    }
    .tv-dash-pie__chart-wrap {
      flex-shrink: 0;
    }
    .tv-dash-pie__chart {
      width: 168px;
      height: 168px;
      border-radius: 50%;
      position: relative;
      box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
    }
    .tv-dash-pie__center {
      position: absolute;
      inset: 22%;
      border-radius: 50%;
      background: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
    }
    .tv-dash-pie__center-val {
      font-size: 1.15rem;
      font-weight: 800;
      line-height: 1.1;
      color: var(--tv-text);
    }
    .tv-dash-pie__center-label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--tv-muted);
      letter-spacing: 0.04em;
    }
    .tv-dash-pie__legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      min-width: 200px;
      flex: 1;
    }
    .tv-dash-pie__legend-item {
      display: grid;
      grid-template-columns: 12px 1fr auto;
      gap: 0.5rem 0.65rem;
      align-items: center;
      font-size: 0.84rem;
    }
    .tv-dash-pie__swatch {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .tv-dash-pie__legend-label {
      color: var(--tv-text);
      font-weight: 600;
    }
    .tv-dash-pie__legend-val {
      font-weight: 700;
      color: var(--tv-text);
      white-space: nowrap;
    }
    .tv-dash-pie__legend-pct {
      font-weight: 500;
      color: var(--tv-muted);
      font-size: 0.78rem;
    }
    @media (max-width: 1100px) {
      .tv-dash-charts__grid {
        grid-template-columns: 1fr;
      }
    }
    .tv-dash-quick-actions {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      width: 100%;
    }
    .tv-dash-quick-actions__head {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding: 0 0.1rem;
    }
    .tv-dash-quick-actions__title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--tv-text);
    }
    .tv-dash-quick-actions__sub {
      margin: 0;
      font-size: 0.86rem;
      line-height: 1.45;
      color: var(--tv-muted);
      max-width: 42rem;
    }
    .tv-dash-quick-actions__panel {
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow);
      padding: 0;
    }
    .tv-dash-quick-actions__grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 1.25rem 1.35rem 1.35rem;
      width: 100%;
      box-sizing: border-box;
    }
    .tv-dash-quick-card {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      min-height: 92px;
      padding: 1rem 1.05rem 1rem 1.1rem;
      border-radius: 12px;
      border: 1px solid var(--tv-border);
      background: var(--tv-surface);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      color: inherit;
      text-decoration: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, transform 0.15s ease;
    }
    .tv-dash-quick-card:hover {
      border-color: rgba(0, 82, 204, 0.24);
      background: #f8fbff;
      box-shadow: 0 6px 18px rgba(0, 82, 204, 0.08);
      transform: translateY(-1px);
      text-decoration: none;
    }
    .tv-dash-quick-card--featured {
      border-color: rgba(0, 82, 204, 0.2);
      background: linear-gradient(145deg, #fff 0%, #f0f7ff 100%);
    }
    .tv-dash-quick-card--featured:hover {
      border-color: rgba(0, 82, 204, 0.32);
      background: linear-gradient(145deg, #f8fbff 0%, #e8f1ff 100%);
    }
    .tv-dash-quick-card__icon {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
      background: rgba(0, 82, 204, 0.08);
      color: var(--tv-primary);
    }
    .tv-dash-quick-card--featured .tv-dash-quick-card__icon {
      background: linear-gradient(135deg, #0052cc, #0ea5e9);
      color: #fff;
      box-shadow: 0 4px 12px rgba(0, 82, 204, 0.22);
    }
    .tv-dash-quick-card__body {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      min-width: 0;
      flex: 1;
    }
    .tv-dash-quick-card__label {
      display: block;
      font-weight: 700;
      font-size: 0.92rem;
      line-height: 1.3;
      letter-spacing: -0.01em;
      color: var(--tv-text);
    }
    .tv-dash-quick-card__desc {
      display: block;
      font-size: 0.78rem;
      line-height: 1.4;
      color: var(--tv-muted);
    }
    .tv-dash-quick-card__arrow {
      flex-shrink: 0;
      font-size: 1.15rem;
      color: rgba(100, 116, 139, 0.55);
      transition: transform 0.15s ease, color 0.15s ease;
    }
    .tv-dash-quick-card:hover .tv-dash-quick-card__arrow {
      color: var(--tv-primary);
      transform: translateX(2px);
    }
    .tv-client-dash-table-panel {
      overflow: hidden;
      border-radius: 14px;
      padding: 0;
    }
    .tv-client-dash-table-inner {
      padding: 1.35rem 1.5rem 1.45rem;
    }
    .tv-client-dash-table-panel .tv-table--dash {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }
    .tv-client-dash-table-panel .tv-table--dash thead th {
      background: #f1f5f9;
      color: #64748b;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.7rem 1rem;
      border-bottom: 1px solid var(--tv-border);
    }
    .tv-client-dash-table-panel .tv-table--dash tbody td {
      padding: 0.8rem 1rem;
      font-size: 0.86rem;
      vertical-align: middle;
      border-bottom: 1px solid #eef2f7;
    }
    .tv-client-dash-table-panel .tv-table--dash tbody tr:last-child td {
      border-bottom: none;
    }
    .tv-client-dash-table-panel .tv-table--dash tbody tr:hover td {
      background: #f8fbff;
    }
    .tv-client-dash-table-panel .tv-table-empty {
      padding: 1.5rem 1rem !important;
    }
    .tv-client-dashboard .tv-client-dash-tables {
      display: grid;
      margin-bottom: 0;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.25rem;
      width: 100%;
      min-width: 0;
    }
    .tv-client-dash-tables .tv-dash-block {
      min-width: 0;
      width: 100%;
    }
    .tv-client-dash-tables .tv-client-dash-table-panel {
      width: 100%;
    }
    .tv-client-dash-tables .tv-client-dash-table-inner {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tv-client-dashboard .tv-client-dash-tables .tv-table--dash {
      min-width: 0;
      width: 100%;
    }
    .tv-table-empty {
      color: var(--tv-muted);
      font-size: 0.88rem;
      padding: 1.25rem 1rem !important;
      text-align: center;
    }
    @media (max-width: 1280px) {
      .tv-kpi-grid--client { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 1100px) {
      .tv-kpi-grid--client { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tv-dash-quick-card {
        min-height: 86px;
        padding: 0.95rem 1rem;
      }
    }
    @media (max-width: 900px) {
      .tv-client-dashboard .tv-client-dash-tables {
        grid-template-columns: 1fr !important;
      }
    }
    @media (max-width: 640px) {
      .tv-kpi-grid--client {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tv-dash-quick-actions__grid {
        grid-template-columns: 1fr;
        padding: 1rem;
      }
      .tv-dash-quick-card {
        min-height: 80px;
      }
      .tv-client-dash-table-inner {
        padding: 1rem 1.1rem 1.15rem;
      }
    }
    @media (max-width: 960px) {
      .tv-send-to-row { grid-template-columns: 1fr; }
      .tv-send-submit { max-width: none; }
    }
    .tv-dlr-report.tv-client-dashboard {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
      max-width: none;
    }
    .tv-kpi-grid--report {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      margin-bottom: 0;
    }
    .tv-dlr-report__filters-panel {
      overflow: hidden;
    }
    .tv-dlr-report__filters-head {
      padding: 1rem 1.25rem 0;
      margin: 0;
    }
    .tv-dlr-report__filters-head .tv-section-head__title {
      font-size: 1rem;
    }
    .tv-dlr-report__filters-body {
      padding: 1rem 1.25rem 1.25rem !important;
    }
    .tv-dlr-report__filters-form {
      display: block;
      width: 100%;
    }
    .tv-app-client .tv-dlr-report__filters-grid {
      display: grid !important;
      grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
      gap: 0.85rem 1rem;
      align-items: end;
      width: 100%;
      box-sizing: border-box;
    }
    .tv-app-client .tv-dlr-report__filters-grid > .tv-filter-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
      width: auto;
      max-width: none;
    }
    .tv-app-client .tv-dlr-report__filters-grid .tv-filter-field__label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--tv-muted, #64748b);
    }
    .tv-app-client .tv-dlr-report__filters-grid .tv-filter-input {
      width: 100%;
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--tv-border, #cbd5e1);
      border-radius: 8px;
      font-size: 0.85rem;
      background: #fff;
      box-sizing: border-box;
    }
    .tv-app-client .tv-dlr-report__filter-actions {
      grid-column: 4 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      justify-content: flex-end;
      align-self: end;
    }
    .tv-dlr-report__table-block {
      margin-bottom: 0;
    }
    .tv-dlr-report__table-panel .tv-dlr-report__table-inner {
      padding: 0;
    }
    .tv-dlr-report__table-wrap {
      overflow-x: auto;
      max-height: 58vh;
    }
    .tv-dlr-report__table { min-width: 1680px; }
    .tv-dlr-report__error-desc {
      max-width: 200px;
      font-size: 0.8rem;
      color: var(--tv-muted, #64748b);
    }
    .tv-dlr-report__error-code {
      white-space: nowrap;
    }
    .tv-dlr-report__mono { font-family: ui-monospace, monospace; font-size: 0.78rem; }
    .tv-dlr-report__msg {
      white-space: nowrap;
      vertical-align: middle;
    }
    .tv-dlr-report__date { white-space: nowrap; font-size: 0.8rem; }
    .tv-dlr-report__pager {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0.85rem 1.25rem;
      border-top: 1px solid var(--tv-border, #e2e8f0);
      background: #fafbfc;
    }
    .tv-dlr-report__pager-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    @media (max-width: 1280px) {
      .tv-kpi-grid--report { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 900px) {
      .tv-app-client .tv-dlr-report__filters-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
      .tv-app-client .tv-dlr-report__filter-actions {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }
    }
    @media (max-width: 640px) {
      .tv-app-client .tv-dlr-report__filters-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
      .tv-kpi-grid--report { grid-template-columns: 1fr; }
    }
    .tv-wallet-report.tv-client-dashboard {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
      max-width: none;
    }
    .tv-app-client .tv-wallet-report__filters-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    }
    .tv-app-client .tv-wallet-report__filters-grid .tv-dlr-report__filter-actions {
      grid-column: 4 / -1;
    }
    .tv-wallet-report__filter-hint {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--tv-muted);
    }
    .tv-wallet-report__table-wrap {
      max-height: 58vh;
    }
    .tv-wallet-report__table {
      min-width: 720px;
    }
    .tv-wallet-report__date {
      white-space: nowrap;
      font-size: 0.84rem;
    }
    .tv-wallet-report__num {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    @media (max-width: 900px) {
      .tv-app-client .tv-wallet-report__filters-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
      .tv-app-client .tv-wallet-report__filters-grid .tv-dlr-report__filter-actions {
        grid-column: 1 / -1;
      }
    }
    .tv-wallet-pay-kpi {
      position: relative;
      display: block;
      color: inherit;
      text-decoration: none;
    }
    .tv-wallet-pay-kpi:hover { text-decoration: none; }
    .tv-wallet-pay-kpi:focus-visible {
      outline: 2px solid rgba(0, 82, 204, 0.35);
      outline-offset: 3px;
      border-radius: var(--tv-radius);
    }
    .tv-wallet-pay-kpi__cta {
      position: absolute;
      right: 1rem;
      bottom: 0.95rem;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--tv-primary);
      background: rgba(0, 82, 204, 0.08);
      border: 1px solid rgba(0, 82, 204, 0.14);
      padding: 0.25rem 0.5rem;
      border-radius: 999px;
      pointer-events: none;
    }
    .tv-wallet-billing-mode {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      grid-column: 1 / -1;
    }
    .tv-wallet-billing-mode__opt {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      font-size: 0.88rem;
      cursor: pointer;
    }
    .tv-wallet-billing-mode__opt span {
      line-height: 1.4;
    }
    .tv-wallet-payment-setup__preview-label {
      margin: 0 0 0.5rem;
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--tv-muted);
    }
    .tv-invoice-page.tv-client-dashboard {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
      max-width: none;
    }
    .tv-invoice-page .tv-kpi-grid--report .tv-kpi__value {
      font-size: clamp(1rem, 2.2vw, 1.55rem);
      line-height: 1.15;
      word-break: keep-all;
      overflow-wrap: normal;
    }
    .tv-invoice-notice .tv-panel__body {
      padding: 1rem 1.25rem;
    }
    .tv-app-client .tv-invoice__filters-grid,
    .tv-app-client .tv-inbox__filters-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
    }
    .tv-app-client .tv-invoice__filters-grid .tv-dlr-report__filter-actions,
    .tv-app-client .tv-inbox__filters-grid .tv-dlr-report__filter-actions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
    .tv-inbox-report.tv-client-dashboard {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
      max-width: none;
    }
    .tv-inbox-report .tv-dlr-report__table-wrap {
      max-height: 62vh;
    }
    .tv-invoice-sent {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.82rem;
    }
    .tv-invoice-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      white-space: nowrap;
    }
    .tv-invoice-detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }
    .tv-invoice-events {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .tv-invoice-event {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.25rem 0.75rem;
      padding: 0.65rem 0.75rem;
      border: 1px solid var(--tv-border, #e2e8f0);
      border-radius: 8px;
      background: #fafbfc;
      font-size: 0.85rem;
    }
    .tv-invoice-event time {
      grid-column: 1;
      color: var(--tv-muted);
      font-size: 0.78rem;
      white-space: nowrap;
    }
    .tv-invoice-event strong {
      grid-column: 2;
      font-weight: 600;
    }
    .tv-invoice-event span {
      grid-column: 2;
      color: var(--tv-muted);
    }
    @media (max-width: 900px) {
      .tv-invoice-detail-grid {
        grid-template-columns: 1fr;
      }
    }
    .tv-contacts-quick-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.85rem;
    }
    .tv-contacts-grid {
      align-items: start;
    }
    .tv-contacts-agendas__list {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .tv-contacts-agenda {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.65rem;
      padding: 0.85rem 0.9rem;
      border-radius: 12px;
      border: 1px solid var(--tv-border);
      background: #fff;
      color: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .tv-contacts-agenda__main {
      flex: 1;
      min-width: 0;
      color: inherit;
      text-decoration: none;
    }
    .tv-contacts-agenda__main:hover { text-decoration: none; }
    .tv-contacts-agenda__actions {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.15rem;
      flex-shrink: 0;
    }
    .tv-contacts-agenda__actions form { margin: 0; }
    .tv-contacts-agenda__icon-btn {
      padding: 0.35rem;
      min-width: 2rem;
      line-height: 1;
    }
    .tv-contacts-agenda__icon-btn .material-symbols-outlined {
      font-size: 1.1rem;
    }
    .tv-contacts-agenda__icon-btn--danger { color: var(--tv-danger); }
    .tv-contacts-agenda__icon-btn--danger:hover { color: var(--tv-danger); background: rgba(220, 38, 38, 0.06); }
    .tv-contacts-agenda__link {
      display: block;
      color: inherit;
      text-decoration: none;
    }
    .tv-contacts-agenda__link:hover {
      text-decoration: none;
    }
    .tv-contacts-agenda:hover {
      border-color: rgba(0, 82, 204, 0.22);
      box-shadow: 0 10px 24px rgba(0, 82, 204, 0.08);
    }
    .tv-contacts-agenda__campaign { align-self: flex-start; }
    .tv-contacts-agenda--active {
      border-color: rgba(0, 82, 204, 0.32);
      background: #f8fbff;
    }
    .tv-contacts-agenda__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }
    .tv-contacts-agenda__name { font-size: 0.92rem; }
    .tv-contacts-agenda__desc {
      margin: 0;
      font-size: 0.78rem;
      color: var(--tv-muted);
      line-height: 1.4;
    }
    .tv-contacts-agenda__meta {
      margin: 0.55rem 0 0;
      font-size: 0.72rem;
      color: var(--tv-muted);
    }
    .tv-contacts-agendas__cta { margin-top: 0.75rem; }
    .tv-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .tv-tags__item { display: inline-flex; align-items: center; gap: 0.2rem; }
    .tv-tag-action {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: var(--tv-muted);
      text-decoration: none;
      padding: 0.1rem 0.25rem;
    }
    .tv-tag-action:hover { color: var(--tv-primary); }
    .tv-tag {
      display: inline-flex;
      align-items: center;
      padding: 0.15rem 0.45rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
      background: rgba(0, 82, 204, 0.08);
      border: 1px solid rgba(0, 82, 204, 0.12);
      color: var(--tv-primary);
      white-space: nowrap;
    }
    .tv-tag--muted {
      background: rgba(100, 116, 139, 0.08);
      border-color: rgba(100, 116, 139, 0.12);
      color: var(--tv-muted);
    }
    .tv-contacts-date { white-space: nowrap; font-size: 0.82rem; }
    .tv-contacts-actions { white-space: nowrap; }
    .tv-contacts-bulk {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border: 1px solid rgba(0, 82, 204, 0.15);
      border-radius: 12px;
      background: #f8fbff;
      margin-bottom: 0.75rem;
    }
    .tv-contacts-bulk__right { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
    .tv-contacts-table-wrap { overflow-x: auto; }
    @media (max-width: 1280px) {
      .tv-contacts-quick-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 900px) {
      .tv-contacts-quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 640px) {
      .tv-contacts-quick-grid { grid-template-columns: 1fr; }
    }
    .tv-templates-page,
    .tv-api-page,
    .tv-support-page,
    .tv-settings-page,
    .tv-orders-page {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      min-width: 0;
    }
    .tv-app-client .tv-page-head--row {
      gap: 1rem;
    }
    .tv-app-client .tv-page-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      justify-content: flex-end;
    }
    .tv-app-client .tv-code {
      max-width: 100%;
      overflow: hidden;
    }
    .tv-app-client .tv-code pre {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin: 0;
      max-width: 100%;
    }
    .tv-app-client .tv-code pre code {
      display: block;
      white-space: pre;
      font-size: 0.78rem;
    }
    .tv-orders-table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tv-orders-cards {
      display: none;
      flex-direction: column;
      gap: 0.75rem;
    }
    .tv-order-card {
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1rem;
      background: var(--tv-surface);
    }
    .tv-order-card__head {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }
    .tv-order-card__meta {
      font-size: 0.8rem;
      color: var(--tv-muted);
      margin: 0.25rem 0;
    }
    .tv-order-card__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.65rem;
    }
    @media (max-width: 768px) {
      .tv-orders-table-wrap { display: none; }
      .tv-orders-cards { display: flex; }
      .tv-app-client .tv-page-head--row {
        flex-direction: column;
        align-items: stretch;
      }
      .tv-app-client .tv-page-actions {
        justify-content: stretch;
      }
      .tv-app-client .tv-page-actions .btn,
      .tv-app-client .tv-page-actions .tv-btn-campaign {
        flex: 1 1 calc(50% - 0.25rem);
        min-width: 0;
        justify-content: center;
      }
      .tv-settings-page .tv-tabs {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        max-width: 100%;
      }
      .tv-api-page .tv-api-key-row {
        flex-direction: column;
        align-items: stretch;
      }
      .tv-api-page .tv-api-layout,
      .tv-support-page .tv-support-layout,
      .tv-settings-page .tv-settings-layout {
        gap: 1rem;
      }
    }
    ${getSmsBagCalculatorStyles()}
  `;
}
