/** Tema claro del panel cliente (/app) y login (/login). */

export function renderLightBackgroundHtml(): string {
  return `<div class="tv-light-bg-wrap" aria-hidden="true">
    <div class="tv-light-bg-gradient"></div>
    <div class="tv-light-bg-grid"></div>
    <div class="tv-light-bg-glow tv-light-bg-glow--1"></div>
    <div class="tv-light-bg-glow tv-light-bg-glow--2"></div>
  </div>`;
}

export function getLightPanelThemeStyles(): string {
  return `
    /* —— Tokens modo claro —— */
    .tv-light-theme {
      --tv-light-bg: #eef2f8;
      --tv-light-bg-soft: #f8fafc;
      --tv-light-surface: #ffffff;
      --tv-light-surface-muted: #f4f7fc;
      --tv-light-border: rgba(203, 213, 225, 0.9);
      --tv-light-border-strong: rgba(0, 82, 204, 0.2);
      --tv-light-text: #0f172a;
      --tv-light-muted: #64748b;
      --tv-light-primary: #0052cc;
      --tv-light-accent: #0ea5e9;
      --tv-bg: var(--tv-light-bg);
      --tv-surface: var(--tv-light-surface);
      --tv-border: var(--tv-light-border);
      --tv-text: var(--tv-light-text);
      --tv-muted: var(--tv-light-muted);
      --tv-shadow: 0 4px 24px -8px rgba(15, 23, 42, 0.08);
      --tv-shadow-lg: 0 12px 40px -16px rgba(15, 23, 42, 0.12);
    }

    .tv-light-theme body,
    body.tv-light-theme {
      background: var(--tv-light-bg);
      color: var(--tv-light-text);
    }

    /* Fondo principal */
    .tv-light-bg-wrap {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
      background: var(--tv-light-bg);
    }
    .tv-light-bg-gradient {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(238, 242, 248, 0.4) 42%, var(--tv-light-bg) 100%);
    }
    .tv-light-bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(0, 82, 204, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 82, 204, 0.035) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: radial-gradient(ellipse 90% 70% at 50% 0%, black 15%, transparent 72%);
    }
    .tv-light-bg-glow {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.45;
    }
    .tv-light-bg-glow--1 {
      width: 42vw; height: 42vw; top: -8%; right: -6%;
      background: radial-gradient(circle, rgba(14, 165, 233, 0.14) 0%, transparent 70%);
    }
    .tv-light-bg-glow--2 {
      width: 36vw; height: 36vw; bottom: -6%; left: 10%;
      background: radial-gradient(circle, rgba(0, 82, 204, 0.1) 0%, transparent 70%);
    }

    .tv-light-theme .tv-app {
      position: relative;
      z-index: 1;
    }

    /* Sidebar oscuro (contraste profesional) */
    .tv-light-theme.tv-app-client .tv-sidebar {
      background: linear-gradient(180deg, #0a2458 0%, #061a40 100%);
      border-right: 1px solid rgba(255, 255, 255, 0.08);
    }
    .tv-light-theme.tv-app-client .tv-sidebar__brand {
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
    .tv-light-theme.tv-app-client .tv-brand-lockup,
    .tv-light-theme.tv-app-client .tv-brand-lockup:hover,
    .tv-light-theme.tv-app-client .tv-brand-wordmark {
      color: #fff !important;
    }
    .tv-light-theme.tv-app-client .tv-brand-lockup__sub {
      color: rgba(186, 230, 253, 0.95);
      font-weight: 600;
    }
    .tv-light-theme.tv-app-client .tv-sidebar__nav-divider {
      background: rgba(255, 255, 255, 0.12);
    }
    .tv-light-theme.tv-app-client .tv-nav-link {
      color: rgba(226, 232, 240, 0.88);
      border-radius: 999px;
    }
    .tv-light-theme.tv-app-client .tv-nav-link:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      text-decoration: none;
    }
    .tv-light-theme.tv-app-client .tv-nav-link--active {
      background: rgba(255, 255, 255, 0.12);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
      color: #fff;
    }
    .tv-light-theme.tv-app-client .tv-nav-link--send {
      background: linear-gradient(135deg, #0052cc 0%, #1d4ed8 50%, #0369a1 100%);
      color: #fff;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0, 82, 204, 0.28);
      border-radius: 999px;
    }
    .tv-light-theme.tv-app-client .tv-nav-link--send:hover {
      filter: brightness(1.05);
      color: #fff;
      text-decoration: none;
    }

    /* Topbar */
    .tv-light-theme.tv-app-client .tv-topbar {
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--tv-light-border);
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
    }
    .tv-light-theme.tv-app-client .tv-topbar__menu {
      color: var(--tv-light-text);
    }
    .tv-light-theme.tv-app-client .tv-pill {
      background: var(--tv-light-surface);
      border-color: var(--tv-light-border);
      color: var(--tv-light-text);
    }
    .tv-light-theme.tv-app-client .tv-pill--balance {
      background: #eff6ff;
      border-color: rgba(0, 82, 204, 0.18);
      color: var(--tv-light-primary);
    }
    .tv-light-theme.tv-app-client .tv-pill--ok {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #047857;
    }
    .tv-light-theme.tv-app-client .tv-pill--warn {
      background: #fffbeb;
      border-color: #fde68a;
      color: #b45309;
    }
    .tv-light-theme.tv-app-client .tv-topbar__icon-btn {
      color: var(--tv-light-muted);
      border-color: var(--tv-light-border);
      background: var(--tv-light-surface);
    }
    .tv-light-theme.tv-app-client .tv-topbar__icon-btn:hover {
      background: #f1f5f9;
      color: var(--tv-light-text);
    }
    .tv-light-theme.tv-app-client .tv-user__avatar {
      background: linear-gradient(135deg, var(--tv-light-primary), var(--tv-light-accent));
      color: #fff;
    }
    .tv-light-theme.tv-app-client .tv-btn-buy-sms {
      border-radius: 9999px;
      background: linear-gradient(135deg, #0052cc 0%, #1d4ed8 50%, #0369a1 100%);
      box-shadow: 0 4px 14px rgba(0, 82, 204, 0.25);
      color: #fff !important;
    }
    .tv-light-theme.tv-app-client .tv-btn-buy-sms__icon,
    .tv-light-theme.tv-app-client .tv-btn-buy-sms__label {
      color: #fff !important;
    }
    .tv-light-theme.tv-app-client .tv-user__name {
      color: var(--tv-light-text);
    }
    .tv-light-theme.tv-app-client .tv-user__company {
      color: var(--tv-light-muted);
    }
    .tv-light-theme.tv-app-client .tv-content {
      background: transparent;
    }

    /* Tipografía */
    .tv-light-theme .tv-page-title {
      font-family: Montserrat, Inter, sans-serif;
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-page-sub {
      color: var(--tv-light-muted);
    }

    /* KPIs dashboard */
    .tv-light-theme .tv-kpi-grid--client .tv-kpi {
      background: var(--tv-light-surface);
      border: 1px solid var(--tv-light-border);
      border-radius: 1rem;
      box-shadow: var(--tv-shadow);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .tv-light-theme .tv-kpi-grid--client .tv-kpi:hover {
      border-color: var(--tv-light-border-strong);
      box-shadow: var(--tv-shadow-lg);
    }
    .tv-light-theme .tv-kpi__icon {
      color: var(--tv-light-primary);
      background: rgba(0, 82, 204, 0.08);
      border-radius: 0.55rem;
      padding: 0.2rem;
    }
    .tv-light-theme .tv-kpi__label {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-kpi__value {
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-kpi__hint {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-kpi--primary {
      background: linear-gradient(145deg, #ffffff 0%, #f0f7ff 100%);
      border-color: rgba(0, 82, 204, 0.18);
    }
    .tv-light-theme .tv-kpi--primary .tv-kpi__value {
      color: var(--tv-light-primary);
    }
    .tv-light-theme .tv-kpi--success .tv-kpi__value {
      color: #059669;
    }
    .tv-light-theme .tv-kpi--warn .tv-kpi__value {
      color: #d97706;
    }
    .tv-light-theme .tv-kpi--danger .tv-kpi__value {
      color: #dc2626;
    }

    /* Paneles, gráficos y tablas */
    .tv-light-theme .tv-dash-charts__card,
    .tv-light-theme .tv-panel,
    .tv-light-theme .tv-client-dash-table-panel {
      background: var(--tv-light-surface);
      border: 1px solid var(--tv-light-border);
      box-shadow: var(--tv-shadow);
    }
    .tv-light-theme .tv-dash-charts__title,
    .tv-light-theme .tv-dash-block__title,
    .tv-light-theme .tv-section-head__title {
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-dash-charts__sub,
    .tv-light-theme .tv-dash-block__sub,
    .tv-light-theme .tv-section-head__sub {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-dash-block__link {
      color: var(--tv-light-primary);
    }
    .tv-light-theme .tv-dash-pie__center {
      background: #fff !important;
      box-shadow: inset 0 0 0 1px var(--tv-light-border);
    }
    .tv-light-theme .tv-dash-pie__center-val {
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-dash-pie__center-label,
    .tv-light-theme .tv-dash-pie__legend-label {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-dash-chart-empty,
    .tv-light-theme .tv-table-empty {
      color: var(--tv-light-muted);
    }

    /* Tablas */
    .tv-light-theme .tv-table th,
    .tv-light-theme th {
      background: #f8fafc !important;
      color: var(--tv-light-muted) !important;
      border-bottom-color: var(--tv-light-border) !important;
    }
    .tv-light-theme .tv-table td {
      color: var(--tv-light-text);
      border-bottom-color: #eef2f7;
    }
    .tv-light-theme .tv-table tbody tr:hover,
    .tv-light-theme tbody tr:hover {
      background: #f8fbff !important;
    }
    .tv-light-theme .tv-table tbody tr:hover td,
    .tv-light-theme tbody tr:hover td,
    .tv-light-theme .tv-client-dash-table-panel .tv-table--dash tbody tr:hover td {
      background: #f8fbff !important;
    }
    .tv-light-theme .tv-dlr-report__pager {
      background: #fafbfc !important;
      border-top-color: var(--tv-light-border) !important;
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-dlr-report__pager-page {
      color: var(--tv-light-text);
    }

    /* Formularios y filtros */
    .tv-light-theme .input,
    .tv-light-theme select,
    .tv-light-theme textarea,
    .tv-light-theme .form-group input,
    .tv-light-theme .form-group select,
    .tv-light-theme .form-group textarea,
    .tv-light-theme .tv-filter-input {
      background: #fff !important;
      border: 1px solid var(--tv-light-border) !important;
      color: var(--tv-light-text) !important;
      border-radius: 0.65rem;
    }
    .tv-light-theme select option {
      background: #fff;
      color: var(--tv-light-text);
    }
    .tv-light-theme .input:focus,
    .tv-light-theme select:focus,
    .tv-light-theme textarea:focus,
    .tv-light-theme .tv-filter-input:focus {
      outline: none;
      border-color: var(--tv-light-primary) !important;
      box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.12);
    }
    .tv-light-theme .field-label,
    .tv-light-theme .tv-filter-field__label,
    .tv-light-theme .field-hint {
      color: var(--tv-light-muted);
    }

    /* Botones */
    .tv-light-theme .btn-primary {
      background: var(--tv-light-primary) !important;
      border-color: #003d99 !important;
      color: #fff !important;
    }
    .tv-light-theme .btn-primary:hover {
      background: #003d99 !important;
    }
    .tv-light-theme .btn-secondary {
      background: #fff !important;
      color: var(--tv-light-primary) !important;
      border: 1px solid var(--tv-light-border) !important;
    }
    .tv-light-theme .btn-secondary:hover:not(:disabled) {
      background: #f0f7ff !important;
      border-color: var(--tv-light-border-strong) !important;
    }
    .tv-light-theme .btn-ghost {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .btn-ghost:hover:not(:disabled) {
      background: #f1f5f9 !important;
      color: var(--tv-light-text);
    }

    /* Alertas y badges */
    .tv-light-alert {
      border-radius: 0.85rem;
      padding: 0.85rem 1.1rem;
      font-size: 0.88rem;
      border: 1px solid rgba(0, 82, 204, 0.2);
      background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
      color: #1e40af;
    }
    .tv-light-theme .alert-success {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #047857;
    }
    .tv-light-theme .alert-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
    }
    .tv-light-theme .alert-warn {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #b45309;
    }
    .tv-light-theme .badge,
    .tv-light-theme .tv-badge {
      background: rgba(0, 82, 204, 0.08);
      border: 1px solid rgba(0, 82, 204, 0.14);
      color: var(--tv-light-primary);
    }
    .tv-light-theme .badge-ok,
    .tv-light-theme .badge-success {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #047857;
    }
    .tv-light-theme .badge-warn {
      background: #fffbeb;
      border-color: #fde68a;
      color: #b45309;
    }
    .tv-light-theme .badge-err,
    .tv-light-theme .badge-danger {
      background: #fef2f2;
      border-color: #fecaca;
      color: #b91c1c;
    }
    .tv-light-theme .tv-inbox-row--active td {
      background: #eff6ff !important;
    }
    .tv-light-theme .tv-dlr-report__error-desc {
      color: var(--tv-light-muted);
    }

    /* Enlaces */
    .tv-light-theme a:not(.btn):not(.tv-nav-link):not(.tv-dash-block__link):not(.tv-brand-lockup) {
      color: var(--tv-light-primary);
    }

    /* Tarjetas rápidas y contactos */
    .tv-light-theme .tv-dash-quick-card {
      background: var(--tv-light-surface) !important;
      border-color: var(--tv-light-border) !important;
    }
    .tv-light-theme .tv-dash-quick-card:hover,
    .tv-light-theme .tv-dash-quick-card--featured {
      background: #f8fbff !important;
      border-color: var(--tv-light-border-strong) !important;
    }
    .tv-light-theme .tv-dash-quick-card__title {
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-dash-quick-card__sub {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-inbox-mode,
    .tv-light-theme .tv-inbox-mode .badge {
      white-space: nowrap;
    }
    .tv-light-theme .tv-contacts-agenda {
      background: var(--tv-light-surface) !important;
      border-color: var(--tv-light-border) !important;
      box-shadow: var(--tv-shadow);
    }
    .tv-light-theme .tv-contacts-agenda:hover,
    .tv-light-theme .tv-contacts-agenda--active {
      background: #f0f7ff !important;
      border-color: var(--tv-light-border-strong) !important;
    }
    .tv-light-theme .tv-contacts-bulk {
      background: #f0f7ff !important;
      border-color: rgba(0, 82, 204, 0.15) !important;
    }
    .tv-light-theme .tv-contacts-wizard-choice:hover {
      background: #f8fbff !important;
      border-color: var(--tv-light-border-strong) !important;
    }
    .tv-light-theme .tv-contacts-import-drop:hover,
    .tv-light-theme .tv-contacts-import-drop--drag {
      background: #f0f7ff !important;
      border-color: var(--tv-light-primary) !important;
    }

    /* Facturación — acciones con iconos */
    .tv-light-theme .tv-invoice-action {
      background: #fff !important;
      border-color: var(--tv-light-border) !important;
      color: var(--tv-light-muted) !important;
    }
    .tv-light-theme .tv-invoice-action--primary {
      color: var(--tv-light-primary) !important;
      border-color: rgba(0, 82, 204, 0.22) !important;
      background: #eff6ff !important;
    }
    .tv-light-theme .tv-invoice-action:hover:not(.tv-invoice-action--disabled):not(:disabled) {
      border-color: var(--tv-light-border-strong) !important;
      background: #f0f7ff !important;
      color: var(--tv-light-primary) !important;
    }
    .tv-light-theme .tv-invoice-action__tip {
      background: #0f172a;
      color: #f8fafc;
      border: none;
    }

    /* Modales */
    .tv-light-theme .tv-overlay {
      background: rgba(15, 23, 42, 0.45);
    }
    .tv-light-theme .tv-send-confirm-modal__panel {
      background: #fff !important;
      border: 1px solid var(--tv-light-border);
      box-shadow: var(--tv-shadow-lg) !important;
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-send-confirm-modal__backdrop {
      background: rgba(15, 23, 42, 0.48) !important;
    }
    .tv-light-theme .tv-send-confirm-stat,
    .tv-light-theme .tv-send-confirm-modal__meta,
    .tv-light-theme .tv-send-confirm-modal__footer,
    .tv-light-theme .tv-panel--hint,
    .tv-light-theme .tv-invoice-event {
      background: #f8fafc !important;
      border-color: var(--tv-light-border) !important;
    }
    .tv-light-theme .tv-send-confirm-stat__value {
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-send-confirm-stat__label {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-send-confirm-modal__close:hover {
      background: #f1f5f9 !important;
    }
    .tv-light-theme .tv-input-readonly-locked {
      background: #f1f5f9 !important;
    }

    /* Calculadora Comprar SMS (estilo landing claro) */
    .tv-light-theme .tv-buy-sms-calc .calc-hero-title {
      color: var(--tv-light-text);
      font-family: Montserrat, Inter, sans-serif;
    }
    .tv-light-theme .tv-buy-sms-calc .section-eyebrow {
      color: var(--tv-light-primary);
    }
    .tv-light-theme .tv-buy-sms-calc .calc-hero-intro,
    .tv-light-theme .tv-buy-sms-calc .calc-footnote,
    .tv-light-theme .tv-buy-sms-calc .calc-cta-note {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-buy-sms-calc .calc-panel {
      background: #fff !important;
      border: 1px solid rgba(0, 82, 204, 0.12) !important;
      box-shadow: 0 16px 48px -24px rgba(0, 82, 204, 0.12) !important;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-slider-block {
      border-bottom-color: #e8ebf4;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-slider-label {
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-buy-sms-calc .calc-vol-display,
    .tv-light-theme .tv-buy-sms-calc .calc-result-total-value {
      color: var(--tv-light-primary);
    }
    .tv-light-theme .tv-buy-sms-calc .calc-range-input {
      background: rgba(0, 82, 204, 0.12);
      height: 8px;
      border-radius: 9999px;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-range-input::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0052cc, #0ea5e9);
      border: 2px solid #fff;
      box-shadow: 0 2px 8px rgba(0, 82, 204, 0.25);
      cursor: grab;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-tier-chip {
      background: #fff !important;
      border-color: rgba(0, 82, 204, 0.16) !important;
      color: var(--tv-light-muted) !important;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-tier-chip:hover {
      border-color: rgba(0, 82, 204, 0.35) !important;
      background: #f0f7ff !important;
      color: var(--tv-light-primary) !important;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-tier-chip.is-active {
      background: linear-gradient(135deg, #0052cc, #0369a1) !important;
      border-color: #0052cc !important;
      color: #fff !important;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-result-panel {
      background: linear-gradient(180deg, #f8fbff 0%, #f4f7fc 100%) !important;
      border: 1px solid rgba(0, 82, 204, 0.1) !important;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-result-heading {
      color: var(--tv-light-muted);
      font-family: Montserrat, Inter, sans-serif;
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-result-qty {
      color: var(--tv-light-text);
      font-family: Montserrat, Inter, sans-serif;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-result-row-label {
      color: var(--tv-light-muted);
    }
    .tv-light-theme .tv-buy-sms-calc .calc-result-row-value {
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-buy-sms-calc .calc-result-total-label {
      color: var(--tv-light-primary);
    }
    .tv-light-theme .tv-buy-sms-calc .calc-result-breakdown {
      border-bottom-color: rgba(0, 82, 204, 0.1);
    }
    .tv-light-theme .tv-buy-sms-calc .lab-pack-includes {
      border-top-color: #e8ebf4;
    }
    .tv-light-theme .tv-buy-sms-calc .pack-includes-title {
      color: var(--tv-light-text);
    }
    .tv-light-theme .tv-buy-sms-calc .pack-includes-item {
      color: var(--tv-light-muted) !important;
      background: transparent !important;
    }
    .tv-light-theme .tv-buy-sms-calc .pack-includes-item .material-symbols-outlined {
      color: var(--tv-light-primary);
    }
    .tv-light-theme .tv-buy-sms-calc .calc-cta-btn--primary {
      background: linear-gradient(135deg, #0052cc, #0369a1) !important;
      color: #fff !important;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-cta-btn--secondary {
      background: #fff !important;
      border: 1px solid var(--tv-light-border) !important;
      color: var(--tv-light-primary) !important;
    }
    .tv-light-theme .tv-buy-sms-calc .calc-cta-link {
      color: var(--tv-light-primary);
    }

    .tv-light-theme .tv-panel__body {
      background: transparent;
    }
    .tv-light-theme .table-wrap {
      background: transparent;
    }

    /* —— Login / auth (modo claro) —— */
    body.tv-light-auth,
    .tv-light-auth.tv-light-theme {
      background: var(--tv-light-bg);
      color: var(--tv-light-text);
    }
    .tv-light-auth .tv-auth-wrap {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .tv-light-auth .tv-lab-glass-card {
      width: 100%;
      max-width: 480px;
      border-radius: 1.25rem;
      border: 1px solid var(--tv-light-border);
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      box-shadow: var(--tv-shadow-lg);
      padding: 1.85rem 1.95rem 1.65rem;
    }
    .tv-light-auth .tv-auth-brand .tv-brand-wordmark {
      color: var(--tv-light-text);
    }
    .tv-light-auth .tv-auth-sub,
    .tv-light-auth .field-hint {
      color: var(--tv-light-muted);
    }
    .tv-light-auth .tv-page-title,
    .tv-light-auth .tv-auth-title {
      font-family: Montserrat, Inter, sans-serif;
      color: var(--tv-light-text);
    }
    .tv-light-auth .tv-page-sub {
      color: var(--tv-light-muted);
    }
    .tv-light-auth .input {
      background: #fff;
      border: 1px solid var(--tv-light-border);
      color: var(--tv-light-text);
      border-radius: 0.75rem;
    }
    .tv-light-auth .input:focus {
      outline: none;
      border-color: var(--tv-light-primary);
      box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.12);
    }
    .tv-light-auth .field-label {
      color: var(--tv-light-muted);
      font-size: 0.82rem;
      font-weight: 600;
    }
    .tv-light-auth .alert-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      font-size: 0.88rem;
    }
    .tv-light-auth .tv-lab-auth-divider__line {
      background: var(--tv-light-border);
    }
    .tv-light-auth .tv-lab-auth-divider__text {
      color: var(--tv-light-muted);
    }
    .tv-light-auth .btn-primary,
    .tv-light-auth .tv-lab-btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border-radius: 9999px;
      font-weight: 600;
      color: #fff !important;
      background: linear-gradient(135deg, #0052cc 0%, #0369a1 100%) !important;
      border: none !important;
      box-shadow: 0 4px 20px rgba(0, 82, 204, 0.22);
      text-decoration: none;
      transition: transform 0.2s, filter 0.2s;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.92rem;
    }
    .tv-light-auth .btn-primary:hover,
    .tv-light-auth .tv-lab-btn-primary:hover {
      transform: translateY(-1px);
      filter: brightness(1.04);
    }
    .tv-light-auth .btn-ghost,
    .tv-light-auth .tv-lab-btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border-radius: 9999px;
      font-weight: 600;
      color: var(--tv-light-primary) !important;
      border: 1px solid rgba(0, 82, 204, 0.22) !important;
      background: #fff !important;
      text-decoration: none;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.92rem;
      width: 100%;
    }
    .tv-light-auth .btn-ghost:hover,
    .tv-light-auth .tv-lab-btn-secondary:hover {
      border-color: rgba(0, 82, 204, 0.35) !important;
      background: #eff6ff !important;
    }
    .tv-light-auth .tv-auth-submit {
      width: 100%;
      margin-top: 0.35rem;
    }
  `;
}
