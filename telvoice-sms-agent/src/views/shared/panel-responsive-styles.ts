/** Media queries compartidos: panel cliente (/app) y superadmin (/admin). */
export function getPanelResponsiveStyles(): string {
  return `
    /* —— Breakpoints unificados (desktop > tablet > mobile) —— */
    @media (max-width: 1280px) {
      .tv-content { max-width: 100%; }
      .tv-dlr-report__layout,
      .tv-wallet-report__layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 1100px) {
      .tv-dash-charts__grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }
      .tv-templates-layout,
      .tv-chat-layout {
        grid-template-columns: 1fr;
      }
      .tv-test-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 1024px) {
      .tv-kpi-grid--client,
      .tv-kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tv-wholesale-actions {
        grid-template-columns: 1fr;
      }
      .tv-inbox-layout {
        grid-template-columns: 1fr;
      }
      .tv-bot-layout {
        grid-template-columns: 1fr;
      }
      .tv-api-docs-layout {
        grid-template-columns: 1fr;
      }
      .tv-api-docs-sidebar {
        position: static;
        max-height: none;
      }
    }

    @media (max-width: 900px) {
      .tv-page-head--row:not(.tv-page-head--title-cta) {
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
      }
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions {
        width: 100%;
        justify-content: flex-start;
      }
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions .btn,
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions .tv-btn-campaign,
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions a.btn {
        flex: 1 1 auto;
        min-width: 0;
        justify-content: center;
      }
      .tv-filters--wrap,
      .tv-filters.tv-filters--wrap {
        flex-direction: column;
        align-items: stretch;
      }
      .tv-filters--wrap > *,
      .tv-filters.tv-filters--wrap > * {
        width: 100%;
        min-width: 0 !important;
      }
      .tv-admin-campaign-layout,
      .tv-send-layout {
        grid-template-columns: 1fr !important;
        display: grid;
        gap: 1rem;
      }
      .tv-send-aside {
        order: 2;
      }
      .tv-send-main {
        order: 1;
      }
      .tv-dash-grid--2:not(.tv-client-dash-tables) {
        grid-template-columns: 1fr;
      }
      .tv-client-dashboard .tv-client-dash-tables {
        display: grid;
        grid-template-columns: 1fr !important;
      }
      .tv-stat-chips:not(.tv-stat-chips--ops) {
        flex-wrap: wrap;
      }
      .tv-topbar__actions {
        flex-shrink: 1;
        min-width: 0;
      }
      .tv-topbar__pills {
        overflow-x: auto;
        flex-wrap: nowrap;
        max-width: 100%;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
      }
    }

    @media (max-width: 768px) {
      /* Grids inline en vistas (filtros, formularios admin) → una columna */
      .tv-content [style*="grid-template-columns"]:not(.tv-mode-grid):not(.tv-chart):not(.tv-chart--dashboard) {
        grid-template-columns: 1fr !important;
      }
      .tv-content [style*="grid-template-columns: repeat(auto-fit"],
      .tv-content [style*="grid-template-columns:repeat(auto-fit"] {
        grid-template-columns: 1fr !important;
      }
      .meta-grid {
        grid-template-columns: 1fr;
      }
      .tv-form-grid,
      .tv-form-grid--compact {
        grid-template-columns: 1fr;
      }
      .tv-section-head--row {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }
      .tv-panel__head--row {
        flex-direction: column;
        align-items: flex-start;
      }
      .table-wrap,
      .tv-mass-table-wrap .table-wrap,
      .tv-orders-table-wrap,
      .tv-inbox-table-wrap {
        margin-left: -0.25rem;
        margin-right: -0.25rem;
        border-radius: 10px;
        -webkit-overflow-scrolling: touch;
      }
      .tv-dlr-report__table-inner .tv-table--dash,
      .tv-orders-table-wrap .tv-table {
        min-width: 520px;
      }
      .tv-dash-pie {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .tv-dash-pie__legend {
        width: 100%;
        max-width: 280px;
      }
      .tv-chart--dashboard {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 0.25rem;
      }
      .tv-chart--dashboard .tv-chart__col {
        min-width: 2.5rem;
      }
      .tv-phone,
      .tv-send-preview-phone,
      .tv-hero-phone {
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
      }
      .tv-var-row {
        gap: 0.35rem;
      }
      .tv-var-chip,
      .tv-var-btn {
        font-size: 0.72rem;
        padding: 0.25rem 0.45rem;
      }
      .tv-tabs {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
      }
      .tv-tab {
        flex-shrink: 0;
      }
      .dlr-actions {
        flex-direction: column;
        align-items: stretch;
      }
      .dlr-actions .btn,
      .dlr-actions a {
        width: 100%;
        justify-content: center;
      }
    }

    @media (max-width: 640px) {
      .tv-kpi-grid--client {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tv-kpi-grid:not(.tv-kpi-grid--client) {
        grid-template-columns: 1fr;
      }
      .tv-mode-grid {
        grid-template-columns: 1fr !important;
      }
      .tv-app-send-page .tv-mode-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
      .tv-page-title {
        font-size: 1.35rem;
        line-height: 1.25;
      }
      .tv-page-sub {
        font-size: 0.88rem;
      }
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions {
        flex-direction: column;
        align-items: stretch;
      }
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions .btn,
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions .tv-btn-campaign,
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions a.btn,
      .tv-page-head--row:not(.tv-page-head--title-cta) .tv-page-actions button {
        width: 100%;
      }
      .tv-app-client .tv-topbar__actions .tv-btn-buy-sms {
        width: 2.5rem;
        height: 2.5rem;
        padding: 0;
        gap: 0;
        border-radius: 10px;
      }
      .tv-app-client .tv-topbar__actions .tv-btn-buy-sms__label {
        display: none;
      }
      .tv-app-client .tv-topbar__actions .tv-btn-buy-sms__icon {
        font-size: 1.25rem;
      }
      .tv-topbar__actions .logout-form .btn {
        padding: 0.35rem 0.5rem;
        font-size: 0.78rem;
      }
      .tv-stat-chips {
        flex-direction: column;
        align-items: stretch;
      }
      .tv-stat-chip {
        width: 100%;
      }
      .tv-notice-block,
      .alert {
        font-size: 0.88rem;
      }
      .tv-panel__body {
        padding: 0.85rem 1rem;
      }
      .tv-table--dense th,
      .tv-table--dense td {
        padding: 0.45rem 0.4rem;
        font-size: 0.78rem;
      }
    }

    @media (max-width: 480px) {
      .tv-content {
        padding: 0.75rem;
      }
      .tv-topbar {
        padding: 0 0.5rem;
        min-height: 56px;
        height: auto;
        flex-wrap: wrap;
        padding-top: 0.35rem;
        padding-bottom: 0.35rem;
      }
      .tv-topbar__menu {
        margin-right: 0.25rem;
      }
      .tv-pill {
        font-size: 0.72rem;
        padding: 0.2rem 0.45rem;
      }
      .tv-user__avatar {
        width: 32px;
        height: 32px;
        font-size: 0.75rem;
      }
      table {
        min-width: 480px;
        font-size: 0.75rem;
      }
      .tv-code pre {
        font-size: 0.72rem;
        overflow-x: auto;
      }
      .tv-btn-campaign,
      .btn {
        font-size: 0.82rem;
      }
      .tv-dash-block__head {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.35rem;
      }
    }

    /* Accesibilidad: reduce motion */
    @media (prefers-reduced-motion: reduce) {
      .tv-sidebar {
        transition: none;
      }
    }
  `;
}
