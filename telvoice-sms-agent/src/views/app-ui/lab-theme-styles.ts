/** Tema visual landing-agent-lab para panel cliente (/app) y login. */

export function renderLabBackgroundHtml(): string {
  return `<div class="tv-lab-bg-wrap" aria-hidden="true">
    <div class="tv-lab-bg-radial tv-lab-bg-radial--1"></div>
    <div class="tv-lab-bg-radial tv-lab-bg-radial--2"></div>
    <div class="tv-lab-bg-radial tv-lab-bg-radial--3"></div>
    <div class="tv-lab-bg-grid"></div>
    <svg class="tv-lab-bg-network" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" fill="none">
      <path stroke="rgba(56,189,248,0.15)" stroke-width="1" d="M0 400 Q300 300 600 400 T1200 350" />
      <path stroke="rgba(129,140,248,0.12)" stroke-width="1" d="M0 200 Q400 350 800 150 T1200 250" />
      <path stroke="rgba(59,130,246,0.1)" stroke-width="1" d="M100 600 L350 450 L600 520 L850 380 L1100 480" />
      <circle fill="rgba(34,211,238,0.4)" r="3" cx="100" cy="600" />
      <circle fill="rgba(59,130,246,0.5)" r="3" cx="350" cy="450" />
      <circle fill="rgba(129,140,248,0.4)" r="3" cx="600" cy="520" />
      <circle fill="rgba(34,211,238,0.35)" r="3" cx="850" cy="380" />
      <circle fill="rgba(59,130,246,0.4)" r="3" cx="1100" cy="480" />
    </svg>
  </div>`;
}

export function getLabPanelThemeStyles(): string {
  return `
    /* —— Tokens Lab (panel cliente) —— */
    .tv-lab-theme {
      --tv-lab-bg: #050814;
      --tv-lab-elevated: #0a1024;
      --tv-lab-surface: rgba(12, 20, 48, 0.78);
      --tv-lab-border: rgba(120, 160, 255, 0.16);
      --tv-lab-border-bright: rgba(56, 189, 248, 0.32);
      --tv-lab-text: #eef2ff;
      --tv-lab-muted: #a8b4d0;
      --tv-lab-cyan: #38bdf8;
      --tv-lab-purple: #818cf8;
      --tv-lab-primary: #0052cc;
      --tv-bg: transparent;
      --tv-surface: var(--tv-lab-surface);
      --tv-border: var(--tv-lab-border);
      --tv-text: var(--tv-lab-text);
      --tv-muted: var(--tv-lab-muted);
      --tv-bg-sidebar: var(--tv-lab-elevated);
    }

    .tv-lab-theme body,
    body.tv-lab-theme,
    body.tv-lab-auth {
      background: var(--tv-lab-bg);
      color: var(--tv-lab-text);
    }

    /* Fondo fijo */
    .tv-lab-bg-wrap {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .tv-lab-bg-radial {
      position: absolute;
      border-radius: 50%;
      filter: blur(90px);
      opacity: 0.38;
    }
    .tv-lab-bg-radial--1 {
      width: 50vw; height: 50vw; top: -12%; left: -8%;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.28) 0%, transparent 70%);
    }
    .tv-lab-bg-radial--2 {
      width: 42vw; height: 42vw; top: 38%; right: -10%;
      background: radial-gradient(circle, rgba(129, 140, 248, 0.2) 0%, transparent 70%);
    }
    .tv-lab-bg-radial--3 {
      width: 36vw; height: 36vw; bottom: -8%; left: 28%;
      background: radial-gradient(circle, rgba(34, 211, 238, 0.14) 0%, transparent 70%);
    }
    .tv-lab-bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(56, 189, 248, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(56, 189, 248, 0.04) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: radial-gradient(ellipse 80% 60% at 50% 20%, black 20%, transparent 75%);
    }
    .tv-lab-bg-network {
      position: absolute;
      inset: 0;
      opacity: 0.14;
    }

    .tv-lab-theme .tv-app,
    .tv-lab-auth .tv-auth-wrap {
      position: relative;
      z-index: 1;
    }

    /* —— Login —— */
    .tv-lab-auth .tv-auth-wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .tv-lab-glass-card {
      width: 100%;
      max-width: 480px;
      border-radius: 1.25rem;
      border: 1px solid var(--tv-lab-border);
      background: var(--tv-lab-surface);
      backdrop-filter: blur(16px);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.03) inset,
        0 16px 48px -24px rgba(0, 0, 0, 0.6);
      padding: 1.85rem 1.95rem 1.65rem;
    }
    .tv-lab-auth .tv-auth-brand .tv-brand-wordmark {
      color: #fff;
    }
    .tv-lab-auth .tv-auth-sub,
    .tv-lab-auth .field-hint {
      color: var(--tv-lab-muted);
    }
    .tv-lab-auth .tv-page-title,
    .tv-lab-auth .tv-auth-title {
      font-family: Montserrat, Inter, sans-serif;
      color: var(--tv-lab-text);
    }
    .tv-lab-auth .tv-page-sub {
      color: var(--tv-lab-muted);
    }
    .tv-lab-auth .input {
      background: rgba(5, 8, 20, 0.55);
      border: 1px solid var(--tv-lab-border);
      color: var(--tv-lab-text);
      border-radius: 0.75rem;
    }
    .tv-lab-auth .input:focus {
      outline: none;
      border-color: var(--tv-lab-border-bright);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12);
    }
    .tv-lab-auth .field-label {
      color: var(--tv-lab-muted);
      font-size: 0.82rem;
      font-weight: 600;
    }
    .tv-lab-auth .alert-error {
      background: rgba(220, 38, 38, 0.12);
      border: 1px solid rgba(248, 113, 113, 0.35);
      color: #fecaca;
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      font-size: 0.88rem;
    }
    .tv-lab-auth-divider {
      margin: 1.25rem 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .tv-lab-auth-divider__line {
      flex: 1;
      height: 1px;
      background: var(--tv-lab-border);
    }
    .tv-lab-auth-divider__text {
      font-size: 0.78rem;
      color: var(--tv-lab-muted);
    }

    /* Botones Lab */
    .tv-lab-theme .btn-primary,
    .tv-lab-auth .btn-primary,
    .tv-lab-btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border-radius: 9999px;
      font-weight: 600;
      color: #fff !important;
      background: linear-gradient(135deg, #0052cc 0%, #1d4ed8 50%, #0369a1 100%) !important;
      border: none !important;
      box-shadow: 0 4px 20px rgba(0, 82, 204, 0.35), 0 0 0 1px rgba(56, 189, 248, 0.12) inset;
      text-decoration: none;
      transition: transform 0.2s, filter 0.2s;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.92rem;
    }
    .tv-lab-theme .btn-primary:hover,
    .tv-lab-auth .btn-primary:hover,
    .tv-lab-btn-primary:hover {
      transform: translateY(-1px);
      filter: brightness(1.06);
      text-decoration: none;
    }
    .tv-lab-theme .btn-secondary,
    .tv-lab-auth .btn-ghost,
    .tv-lab-btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border-radius: 9999px;
      font-weight: 600;
      color: var(--tv-lab-text) !important;
      border: 1px solid var(--tv-lab-border-bright) !important;
      background: rgba(12, 20, 48, 0.6) !important;
      backdrop-filter: blur(8px);
      text-decoration: none;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.92rem;
      width: 100%;
    }
    .tv-lab-auth .btn-ghost:hover,
    .tv-lab-btn-secondary:hover {
      border-color: var(--tv-lab-cyan) !important;
      background: rgba(34, 211, 238, 0.08) !important;
    }
    .tv-lab-auth .tv-auth-submit { width: 100%; margin-top: 0.35rem; }

    /* —— Shell panel cliente —— */
    .tv-lab-theme.tv-app-client .tv-sidebar {
      background: rgba(5, 8, 20, 0.92);
      backdrop-filter: blur(16px);
      border-right: 1px solid var(--tv-lab-border);
    }
    .tv-lab-theme.tv-app-client .tv-sidebar__brand {
      border-bottom-color: var(--tv-lab-border);
    }
    .tv-lab-theme.tv-app-client .tv-brand-lockup,
    .tv-lab-theme.tv-app-client .tv-brand-lockup:hover,
    .tv-lab-theme.tv-app-client .tv-brand-wordmark {
      color: #fff !important;
    }
    .tv-lab-theme.tv-app-client .tv-brand-lockup__sub {
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme.tv-app-client .tv-sidebar__badge {
      background: rgba(56, 189, 248, 0.12);
      color: var(--tv-lab-cyan);
      border-color: rgba(56, 189, 248, 0.28);
    }
    .tv-lab-theme.tv-app-client .tv-sidebar__nav-divider {
      background: var(--tv-lab-border);
    }
    .tv-lab-theme.tv-app-client .tv-nav-link {
      color: rgba(238, 242, 255, 0.82);
      border-radius: 999px;
    }
    .tv-lab-theme.tv-app-client .tv-nav-link:hover {
      background: rgba(56, 189, 248, 0.08);
      color: #fff;
    }
    .tv-lab-theme.tv-app-client .tv-nav-link--active {
      background: rgba(56, 189, 248, 0.14);
      box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.22);
      color: #fff;
    }
    .tv-lab-theme.tv-app-client .tv-nav-link--send {
      background: linear-gradient(135deg, #0052cc 0%, #1d4ed8 50%, #0369a1 100%);
      color: #fff;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0, 82, 204, 0.3);
    }
    .tv-lab-theme.tv-app-client .tv-nav-link--send:hover {
      filter: brightness(1.06);
      background: linear-gradient(135deg, #0052cc 0%, #1d4ed8 50%, #0369a1 100%);
    }
    .tv-lab-theme.tv-app-client .tv-topbar {
      background: rgba(5, 8, 20, 0.82);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--tv-lab-border);
      box-shadow: none;
    }
    .tv-lab-theme.tv-app-client .tv-topbar__menu {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme.tv-app-client .tv-pill {
      background: rgba(12, 20, 48, 0.65);
      border-color: var(--tv-lab-border);
      color: var(--tv-lab-text);
    }
    .tv-lab-theme.tv-app-client .tv-pill--balance {
      background: rgba(56, 189, 248, 0.1);
      border-color: rgba(56, 189, 248, 0.28);
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme.tv-app-client .tv-pill--ok {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(52, 211, 153, 0.28);
      color: #6ee7b7;
    }
    .tv-lab-theme.tv-app-client .tv-btn-buy-sms {
      border-radius: 9999px;
      background: linear-gradient(135deg, #0052cc 0%, #1d4ed8 50%, #0369a1 100%);
      box-shadow: 0 4px 16px rgba(0, 82, 204, 0.28);
    }
    .tv-lab-theme.tv-app-client .tv-user__avatar {
      background: linear-gradient(135deg, var(--tv-lab-cyan), var(--tv-lab-purple));
    }
    .tv-lab-theme.tv-app-client .tv-user__name {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme.tv-app-client .tv-user__company {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme.tv-app-client .tv-content {
      background: transparent;
    }
    .tv-lab-theme.tv-app-client .btn-ghost {
      color: var(--tv-lab-muted);
      border-color: transparent;
    }
    .tv-lab-theme.tv-app-client .btn-ghost:hover {
      color: var(--tv-lab-text);
      background: rgba(56, 189, 248, 0.08);
    }

    /* —— Dashboard —— */
    .tv-lab-theme .tv-page-title {
      font-family: Montserrat, Inter, sans-serif;
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .tv-page-sub {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-kpi-grid--client .tv-kpi {
      border-radius: 1.25rem;
      border: 1px solid var(--tv-lab-border);
      background: var(--tv-lab-surface);
      backdrop-filter: blur(16px);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.03) inset,
        0 16px 48px -24px rgba(0, 0, 0, 0.5);
    }
    .tv-lab-theme .tv-kpi-grid--client .tv-kpi:hover {
      border-color: var(--tv-lab-border-bright);
    }
    .tv-lab-theme .tv-kpi__icon {
      color: var(--tv-lab-cyan);
      background: rgba(56, 189, 248, 0.12);
      border-radius: 0.65rem;
      padding: 0.2rem;
    }
    .tv-lab-theme .tv-kpi__label {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-kpi__value {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .tv-kpi__hint {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-kpi--success .tv-kpi__value {
      color: #6ee7b7;
    }
    .tv-lab-theme .tv-kpi--primary .tv-kpi__value {
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme .tv-dash-charts__card,
    .tv-lab-theme .tv-panel,
    .tv-lab-theme .tv-client-dash-table-panel {
      border-radius: 1.25rem;
      border: 1px solid var(--tv-lab-border);
      background: var(--tv-lab-surface);
      backdrop-filter: blur(16px);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    }
    .tv-lab-theme .tv-dash-charts__title,
    .tv-lab-theme .tv-dash-block__title {
      font-family: Montserrat, Inter, sans-serif;
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .tv-dash-charts__sub,
    .tv-lab-theme .tv-dash-pie__center-label,
    .tv-lab-theme .tv-dash-pie__legend-label {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-dash-pie__center-val {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .tv-dash-block__link {
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme .tv-table th {
      color: var(--tv-lab-muted);
      border-bottom-color: var(--tv-lab-border);
    }
    .tv-lab-theme .tv-table td {
      color: var(--tv-lab-text);
      border-bottom-color: rgba(120, 160, 255, 0.08);
    }
    .tv-lab-theme .tv-table-empty {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-dash-chart-empty {
      color: var(--tv-lab-muted);
    }
    .tv-lab-alert {
      border-radius: 1rem;
      padding: 0.85rem 1.1rem;
      font-size: 0.88rem;
      border: 1px solid var(--tv-lab-border-bright);
      background: rgba(56, 189, 248, 0.08);
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme .tv-overlay {
      background: rgba(5, 8, 20, 0.72);
    }
    .tv-lab-theme a:not(.btn):not(.tv-nav-link):not(.tv-dash-block__link):not(.tv-brand-lockup) {
      color: var(--tv-lab-cyan);
    }

    /* —— Sin fondos blancos: formularios, tablas, badges —— */
    .tv-lab-theme .input,
    .tv-lab-theme select,
    .tv-lab-theme textarea,
    .tv-lab-theme .form-group input,
    .tv-lab-theme .form-group select,
    .tv-lab-theme .form-group textarea,
    .tv-lab-theme .tv-app-client .tv-dlr-report__filters-grid .tv-filter-input,
    .tv-lab-theme .tv-filter-input {
      background: rgba(5, 8, 20, 0.55) !important;
      border: 1px solid var(--tv-lab-border) !important;
      color: var(--tv-lab-text) !important;
      border-radius: 0.65rem;
    }
    .tv-lab-theme select option {
      background: #0a1024;
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .input:focus,
    .tv-lab-theme select:focus,
    .tv-lab-theme textarea:focus,
    .tv-lab-theme .tv-filter-input:focus {
      outline: none;
      border-color: var(--tv-lab-border-bright) !important;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12);
    }
    .tv-lab-theme .tv-table th,
    .tv-lab-theme th {
      background: rgba(8, 14, 36, 0.92) !important;
      color: var(--tv-lab-muted) !important;
      border-bottom-color: var(--tv-lab-border) !important;
    }
    .tv-lab-theme .tv-table tbody tr:hover,
    .tv-lab-theme tbody tr:hover {
      background: rgba(56, 189, 248, 0.05) !important;
    }
    .tv-lab-theme .tv-table tbody tr:hover td,
    .tv-lab-theme tbody tr:hover td,
    .tv-lab-theme .tv-client-dash-table-panel .tv-table--dash tbody tr:hover td {
      background: rgba(56, 189, 248, 0.06) !important;
    }
    .tv-lab-theme .tv-inbox-row--active td {
      background: rgba(56, 189, 248, 0.1) !important;
    }
    .tv-lab-theme .tv-dlr-report__pager {
      background: rgba(8, 14, 36, 0.75) !important;
      border-top-color: var(--tv-lab-border) !important;
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-dlr-report__pager-page {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .btn-secondary {
      background: rgba(12, 20, 48, 0.65) !important;
      color: var(--tv-lab-text) !important;
      border: 1px solid var(--tv-lab-border-bright) !important;
    }
    .tv-lab-theme .btn-secondary:hover:not(:disabled) {
      border-color: var(--tv-lab-cyan) !important;
      background: rgba(34, 211, 238, 0.08) !important;
    }
    .tv-lab-theme .tv-kpi--primary,
    .tv-lab-theme .tv-kpi--default {
      background: var(--tv-lab-surface) !important;
    }
    .tv-lab-theme .tv-kpi--success {
      background: rgba(16, 185, 129, 0.08) !important;
      border-color: rgba(52, 211, 153, 0.22) !important;
    }
    .tv-lab-theme .tv-section-head__title,
    .tv-lab-theme .tv-dlr-report__filters-head .tv-section-head__title {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .field-hint,
    .tv-lab-theme .tv-filter-field__label,
    .tv-lab-theme .tv-dlr-report__error-desc {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .field-label {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .alert-success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(52, 211, 153, 0.28);
      color: #6ee7b7;
    }
    .tv-lab-theme .alert-error {
      background: rgba(220, 38, 38, 0.12);
      border: 1px solid rgba(248, 113, 113, 0.35);
      color: #fecaca;
    }
    .tv-lab-theme .alert-warn {
      background: rgba(217, 119, 6, 0.12);
      border: 1px solid rgba(251, 191, 36, 0.28);
      color: #fcd34d;
    }
    .tv-lab-theme .badge,
    .tv-lab-theme .tv-badge {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.22);
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme .badge-ok,
    .tv-lab-theme .badge-success {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(52, 211, 153, 0.28);
      color: #6ee7b7;
    }
    .tv-lab-theme .badge-warn {
      background: rgba(217, 119, 6, 0.12);
      border-color: rgba(251, 191, 36, 0.28);
      color: #fcd34d;
    }
    .tv-lab-theme .badge-err,
    .tv-lab-theme .badge-danger {
      background: rgba(220, 38, 38, 0.12);
      border-color: rgba(248, 113, 113, 0.28);
      color: #fca5a5;
    }
    .tv-lab-theme .tv-panel__body {
      background: transparent;
    }
    .tv-lab-theme .table-wrap {
      background: transparent;
    }

    /* —— Calculadora Comprar SMS —— */
    .tv-lab-theme .tv-buy-sms-calc .calc-hero-title,
    .tv-lab-theme .tv-buy-sms-calc .pack-includes {
      background: transparent !important;
      border-color: var(--tv-lab-border) !important;
    }
    .tv-lab-theme .tv-buy-sms-calc .pack-includes-title {
      color: var(--tv-lab-text);
      font-family: Montserrat, Inter, sans-serif;
    }
    .tv-lab-theme .tv-buy-sms-calc .section-eyebrow {
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-hero-intro,
    .tv-lab-theme .tv-buy-sms-calc .calc-footnote,
    .tv-lab-theme .tv-buy-sms-calc .calc-cta-note,
    .tv-lab-theme .tv-buy-sms-calc .calc-readonly-note {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-panel {
      background: var(--tv-lab-surface) !important;
      border: 1px solid var(--tv-lab-border) !important;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.03) inset, 0 16px 48px -24px rgba(0, 0, 0, 0.55) !important;
      backdrop-filter: blur(16px);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-slider-block {
      border-bottom-color: var(--tv-lab-border);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-slider-label {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-vol-display,
    .tv-lab-theme .tv-buy-sms-calc .calc-result-total-value {
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-tier-chip {
      background: rgba(8, 14, 36, 0.65) !important;
      border-color: var(--tv-lab-border) !important;
      color: var(--tv-lab-muted) !important;
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-tier-chip:hover {
      border-color: var(--tv-lab-border-bright) !important;
      background: rgba(56, 189, 248, 0.08) !important;
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-tier-chip.is-active {
      background: rgba(0, 82, 204, 0.35) !important;
      border-color: var(--tv-lab-cyan) !important;
      color: #fff !important;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.15);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-tier-chip.is-active .calc-tier-chip-sub {
      color: rgba(238, 242, 255, 0.85) !important;
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-result-panel {
      background: rgba(8, 14, 36, 0.55) !important;
      border: 1px solid var(--tv-lab-border) !important;
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-result-row-label,
    .tv-lab-theme .tv-buy-sms-calc .calc-result-total-label {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-result-row-value {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-result-note {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-buy-sms-calc .pack-includes-item {
      background: rgba(8, 14, 36, 0.55) !important;
      border: 1px solid var(--tv-lab-border) !important;
      color: var(--tv-lab-muted) !important;
    }
    .tv-lab-theme .tv-buy-sms-calc .pack-includes-item .material-symbols-outlined {
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-cta-btn--secondary {
      background: rgba(12, 20, 48, 0.65) !important;
      border: 1px solid var(--tv-lab-border-bright) !important;
      color: var(--tv-lab-text) !important;
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-cta-link {
      color: var(--tv-lab-cyan);
    }
    .tv-lab-theme .tv-buy-sms-calc .calc-cta-link:hover {
      color: #7dd3fc;
    }
    .tv-lab-theme .tv-dash-pie__center {
      background: rgba(8, 14, 36, 0.9) !important;
      box-shadow: inset 0 0 0 1px var(--tv-lab-border);
    }
    .tv-lab-theme .tv-dash-quick-card {
      background: var(--tv-lab-surface) !important;
      border-color: var(--tv-lab-border) !important;
    }
    .tv-lab-theme .tv-dash-quick-card:hover,
    .tv-lab-theme .tv-dash-quick-card--featured {
      background: rgba(56, 189, 248, 0.08) !important;
      border-color: var(--tv-lab-border-bright) !important;
    }
    .tv-lab-theme .tv-send-confirm-modal__panel {
      background: var(--tv-lab-surface) !important;
      border: 1px solid var(--tv-lab-border);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5) !important;
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .tv-send-confirm-modal__backdrop {
      background: rgba(5, 8, 20, 0.78) !important;
    }

    /* —— Pantallas restantes: sin blancos en hover ni tarjetas —— */
    .tv-lab-theme .tv-contacts-agenda {
      background: var(--tv-lab-surface) !important;
      border-color: var(--tv-lab-border) !important;
    }
    .tv-lab-theme .tv-contacts-agenda:hover,
    .tv-lab-theme .tv-contacts-agenda--active {
      background: rgba(56, 189, 248, 0.08) !important;
      border-color: var(--tv-lab-border-bright) !important;
      box-shadow: none;
    }
    .tv-lab-theme .tv-contacts-bulk {
      background: rgba(8, 14, 36, 0.55) !important;
      border-color: var(--tv-lab-border) !important;
    }
    .tv-lab-theme .tv-contacts-wizard-choice:hover {
      background: rgba(56, 189, 248, 0.06) !important;
      border-color: var(--tv-lab-border-bright) !important;
    }
    .tv-lab-theme .tv-contacts-import-drop:hover,
    .tv-lab-theme .tv-contacts-import-drop--drag {
      background: rgba(56, 189, 248, 0.06) !important;
      border-color: var(--tv-lab-border-bright) !important;
    }
    .tv-lab-theme .tv-panel--hint,
    .tv-lab-theme .tv-invoice-event,
    .tv-lab-theme .tv-send-confirm-stat,
    .tv-lab-theme .tv-send-confirm-modal__meta,
    .tv-lab-theme .tv-send-confirm-modal__footer {
      background: rgba(8, 14, 36, 0.55) !important;
      border-color: var(--tv-lab-border) !important;
    }
    .tv-lab-theme .tv-send-confirm-stat__value {
      color: var(--tv-lab-text);
    }
    .tv-lab-theme .tv-send-confirm-stat__label {
      color: var(--tv-lab-muted);
    }
    .tv-lab-theme .tv-send-confirm-modal__close:hover {
      background: rgba(56, 189, 248, 0.1) !important;
    }
    .tv-lab-theme .tv-input-readonly-locked {
      background: rgba(5, 8, 20, 0.45) !important;
    }
    .tv-lab-theme .tv-client-dash-table-panel .tv-table--dash tbody td {
      border-bottom-color: rgba(120, 160, 255, 0.08) !important;
    }
    .tv-lab-theme .tv-dash-block__link:hover {
      color: #7dd3fc;
    }
    .tv-lab-theme .btn-ghost:hover:not(:disabled),
    .tv-lab-theme .btn-secondary:hover:not(:disabled) {
      background: rgba(56, 189, 248, 0.08) !important;
    }
  `;
}
