import { getOrderUiSharedStyles } from "../shared/order-ui-styles.js";

/** Estilos del panel admin Telvoice — shell SaaS + compatibilidad legacy (inline SSR). */
export function getAdminStyles(): string {
  return `
    :root {
      --tv-primary: #0052cc;
      --tv-primary-dark: #003d99;
      --tv-primary-light: #0ea5e9;
      --tv-purple: #5b21b6;
      --tv-purple-soft: #7c3aed;
      --tv-bg: #f4f7fc;
      --tv-bg-sidebar: #0a2458;
      --tv-surface: #ffffff;
      --tv-border: rgba(195, 198, 214, 0.55);
      --tv-text: #0f172a;
      --tv-muted: #64748b;
      --tv-ok: #059669;
      --tv-warn: #d97706;
      --tv-err: #dc2626;
      --tv-sidebar-w: 260px;
      --tv-topbar-h: 64px;
      --tv-radius: 14px;
      --tv-shadow: 0 4px 24px -8px rgba(15, 23, 42, 0.1);
      --tv-shadow-lg: 0 12px 40px -16px rgba(15, 23, 42, 0.14);
      --primary: var(--tv-primary);
      --primary-dark: var(--tv-primary-dark);
      --bg: var(--tv-bg);
      --card: var(--tv-surface);
      --border: var(--tv-border);
      --text: var(--tv-text);
      --muted: var(--tv-muted);
      --ok: var(--tv-ok);
      --warn: var(--tv-warn);
      --err: var(--tv-err);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: var(--tv-bg);
      color: var(--tv-text);
      min-height: 100vh;
      font-size: 15px;
      line-height: 1.5;
    }
    a { color: var(--tv-primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.65rem; font-weight: 800; margin: 0 0 0.35rem; letter-spacing: -0.02em; }
    h2 { font-size: 1.15rem; font-weight: 700; margin: 1.75rem 0 0.85rem; }
    .subtitle, p.subtitle { color: var(--tv-muted); margin: 0 0 1.25rem; font-size: 0.95rem; }
    .container { max-width: 1200px; margin: 0 auto; }

    /* —— App shell —— */
    .tv-app { display: flex; min-height: 100vh; }
    .tv-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      z-index: 40;
    }
    .tv-sidebar {
      width: var(--tv-sidebar-w);
      flex-shrink: 0;
      background: linear-gradient(180deg, #0a2458 0%, #061a40 100%);
      color: #e2e8f0;
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 50;
      overflow-y: auto;
      border-right: 1px solid rgba(255,255,255,0.06);
    }
    .tv-sidebar__brand {
      padding: 1.25rem 1.15rem 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .tv-brand-lockup {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      color: #fff;
      text-decoration: none;
    }
    .tv-brand-lockup:hover { color: #fff; text-decoration: none; }
    .tv-brand-isotipo {
      width: 32px;
      height: 32px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .tv-brand-lockup__text { min-width: 0; }
    .tv-brand-wordmark {
      display: block;
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
      text-transform: lowercase;
      line-height: 1.15;
    }
    .tv-brand-lockup__sub {
      display: block;
      font-size: 0.72rem;
      font-weight: 600;
      color: rgba(255,255,255,0.55);
      margin-top: 0.15rem;
      text-transform: lowercase;
      letter-spacing: 0.04em;
    }
    .tv-sidebar__nav { flex: 1; padding: 0.75rem 0.65rem 1.5rem; }
    .tv-sidebar__section {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.4);
      padding: 1rem 0.75rem 0.4rem;
      font-weight: 700;
    }
    .tv-nav-link {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.55rem 0.75rem;
      border-radius: 10px;
      color: rgba(226, 232, 240, 0.88);
      text-decoration: none;
      font-size: 0.88rem;
      font-weight: 500;
      margin-bottom: 2px;
      transition: background 0.15s, color 0.15s;
    }
    .tv-nav-link .material-symbols-outlined {
      font-size: 1.25rem;
      opacity: 0.85;
    }
    .tv-nav-link:hover {
      background: rgba(255,255,255,0.08);
      color: #fff;
      text-decoration: none;
    }
    .tv-nav-link--active {
      background: linear-gradient(90deg, rgba(14, 165, 233, 0.35), rgba(91, 33, 182, 0.25));
      color: #fff;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
    }
    .tv-main {
      flex: 1;
      margin-left: var(--tv-sidebar-w);
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .tv-topbar {
      height: var(--tv-topbar-h);
      background: var(--tv-surface);
      border-bottom: 1px solid var(--tv-border);
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 1.25rem;
      position: sticky;
      top: 0;
      z-index: 30;
      box-shadow: 0 1px 0 rgba(15,23,42,0.04);
    }
    .tv-topbar__menu {
      display: none;
      border: none;
      background: transparent;
      cursor: pointer;
      padding: 0.35rem;
      border-radius: 8px;
      color: var(--tv-text);
    }
    .tv-topbar__menu:hover { background: var(--tv-bg); }
    .tv-topbar__search {
      flex: 1;
      max-width: 380px;
      position: relative;
    }
    .tv-topbar__search input {
      width: 100%;
      padding: 0.5rem 0.85rem 0.5rem 2.35rem;
      border: 1px solid var(--tv-border);
      border-radius: 10px;
      font-size: 0.88rem;
      background: var(--tv-bg);
      font-family: inherit;
    }
    .tv-topbar__search input:focus {
      outline: 2px solid rgba(0, 82, 204, 0.25);
      border-color: var(--tv-primary);
      background: #fff;
    }
    .tv-topbar__search-icon {
      position: absolute;
      left: 0.65rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--tv-muted);
      font-size: 1.15rem;
      pointer-events: none;
    }
    .tv-topbar__pills {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .tv-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.7rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      background: var(--tv-bg);
      border: 1px solid var(--tv-border);
      white-space: nowrap;
    }
    .tv-pill--ok { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
    .tv-pill--warn { background: #fffbeb; border-color: #fde68a; color: #b45309; }
    .tv-pill .material-symbols-outlined { font-size: 1rem; }
    .tv-topbar__actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-left: auto;
    }
    .tv-topbar__icon-btn {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      border: 1px solid var(--tv-border);
      background: var(--tv-surface);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--tv-muted);
      position: relative;
    }
    .tv-topbar__icon-btn:hover { background: var(--tv-bg); color: var(--tv-text); }
    .tv-topbar__notif-dot {
      position: absolute;
      top: 7px;
      right: 7px;
      width: 7px;
      height: 7px;
      background: var(--tv-purple-soft);
      border-radius: 50%;
      border: 2px solid #fff;
    }
    .tv-user {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.25rem 0.5rem 0.25rem 0.25rem;
      border-radius: 12px;
      border: 1px solid var(--tv-border);
      background: var(--tv-surface);
    }
    .tv-user__avatar {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--tv-primary), var(--tv-purple-soft));
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.85rem;
    }
    .tv-user__meta { line-height: 1.2; min-width: 0; }
    .tv-user__name { font-size: 0.82rem; font-weight: 700; display: block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tv-user__company { font-size: 0.7rem; color: var(--tv-muted); display: block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tv-content { padding: 1.5rem 1.5rem 2.5rem; flex: 1; }

    /* Auth (login / registro) */
    .tv-admin--auth {
      background: linear-gradient(135deg, #f4f7fc 0%, #dce8f8 45%, #ede9fe 100%);
    }
    .tv-auth-wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .tv-auth-card {
      width: 100%;
      max-width: 420px;
      margin: 0 auto;
      background: var(--tv-surface);
      border: 1px solid var(--tv-border);
      border-radius: calc(var(--tv-radius) + 4px);
      padding: 1.75rem 1.85rem 1.5rem;
      box-shadow: var(--tv-shadow-lg);
    }
    .tv-auth-brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      margin-bottom: 1.35rem;
    }
    .tv-auth-brand .tv-brand-isotipo {
      width: 48px;
      height: 48px;
      flex-shrink: 0;
    }
    .tv-auth-title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .tv-auth-sub {
      margin: 0.2rem 0 0;
      font-size: 0.82rem;
      color: var(--tv-muted);
    }
    .tv-auth-form .form-group input { max-width: none; }
    .tv-auth-submit { width: 100%; margin-top: 0.25rem; padding: 0.65rem; }
    .tv-auth-foot {
      margin: 1.15rem 0 0;
      text-align: center;
      font-size: 0.88rem;
      color: var(--tv-muted);
    }
    .tv-auth-foot a { font-weight: 600; }

    /* Dashboard */
    .tv-page-head { margin-bottom: 1.25rem; }
    .tv-page-title { font-size: 1.65rem; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
    .tv-page-sub { margin: 0.25rem 0 0; color: var(--tv-muted); font-size: 0.92rem; }
    .tv-kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .tv-kpi {
      background: var(--tv-surface);
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1rem 1.1rem;
      box-shadow: var(--tv-shadow);
    }
    .tv-kpi--primary { border-color: rgba(0, 82, 204, 0.2); background: linear-gradient(145deg, #fff 0%, #f0f7ff 100%); }
    .tv-kpi--success .tv-kpi__value { color: var(--tv-ok); }
    .tv-kpi--danger .tv-kpi__value { color: var(--tv-err); }
    .tv-kpi--warn .tv-kpi__value { color: var(--tv-warn); }
    .tv-kpi__head { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.5rem; }
    .tv-kpi__icon { font-size: 1.2rem; color: var(--tv-primary); }
    .tv-kpi__label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--tv-muted); }
    .tv-kpi__value { font-size: 1.55rem; font-weight: 800; letter-spacing: -0.02em; }
    .tv-kpi__hint { margin: 0.35rem 0 0; font-size: 0.75rem; color: var(--tv-muted); }
    .tv-dash-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .tv-dash-grid--2 { grid-template-columns: repeat(2, 1fr); }
    .tv-panel {
      background: var(--tv-surface);
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow);
      overflow: hidden;
    }
    .tv-panel--wide { grid-column: span 1; }
    .tv-panel__body { padding: 1rem 1.15rem 1.15rem; }
    .tv-panel__body--flush { padding: 0; }
    .tv-panel__foot { margin: 0.75rem 0 0; font-size: 0.78rem; color: var(--tv-muted); }
    .tv-section-head { padding: 1rem 1.15rem 0; }
    .tv-section-head__title { margin: 0; font-size: 1rem; font-weight: 700; }
    .tv-section-head__sub { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--tv-muted); }
    .tv-chart {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      height: 160px;
      padding-top: 0.5rem;
    }
    .tv-chart__col { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; }
    .tv-chart__bar-wrap {
      flex: 1;
      width: 100%;
      max-width: 48px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .tv-chart__bar {
      width: 100%;
      max-width: 36px;
      border-radius: 8px 8px 4px 4px;
      background: linear-gradient(180deg, var(--tv-primary-light), var(--tv-primary));
      min-height: 4px;
      transition: height 0.3s;
    }
    .tv-chart__label { font-size: 0.68rem; color: var(--tv-muted); margin-top: 0.4rem; text-align: center; }
    .tv-chart__val { font-size: 0.72rem; font-weight: 700; margin-top: 0.15rem; }
    .tv-routes { list-style: none; margin: 0; padding: 0; }
    .tv-route {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.55rem 0;
      border-bottom: 1px solid var(--tv-border);
      font-size: 0.88rem;
    }
    .tv-route:last-child { border-bottom: none; }
    .tv-route__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .tv-route--ok .tv-route__dot { background: var(--tv-ok); box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2); }
    .tv-route--warn .tv-route__dot { background: var(--tv-warn); }
    .tv-route--err .tv-route__dot { background: var(--tv-err); }
    .tv-route__name { flex: 1; font-weight: 600; }
    .tv-route__status { font-size: 0.78rem; color: var(--tv-muted); }
    .tv-quick-grid { display: flex; flex-direction: column; }
    .tv-quick {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1.15rem;
      border-bottom: 1px solid var(--tv-border);
      color: inherit;
      text-decoration: none;
      transition: background 0.12s;
    }
    .tv-quick:last-child { border-bottom: none; }
    .tv-quick:hover { background: var(--tv-bg); text-decoration: none; }
    .tv-quick__icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(0,82,204,0.12), rgba(124,58,237,0.12));
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--tv-primary);
    }
    .tv-quick__text { flex: 1; min-width: 0; }
    .tv-quick__label { display: block; font-weight: 600; font-size: 0.9rem; }
    .tv-quick__desc { display: block; font-size: 0.78rem; color: var(--tv-muted); }
    .tv-quick__arrow { color: var(--tv-muted); font-size: 1.25rem; }
    .tv-meta-list { display: grid; gap: 0.75rem; margin: 0; }
    .tv-meta-list div { display: grid; grid-template-columns: 100px 1fr; gap: 0.5rem; align-items: center; }
    .tv-meta-list dt { font-size: 0.72rem; text-transform: uppercase; color: var(--tv-muted); font-weight: 700; margin: 0; }
    .tv-meta-list dd { margin: 0; font-weight: 600; font-size: 0.88rem; }
    .tv-meta-dd--truncate { font-size: 0.75rem; word-break: break-all; font-weight: 500; }
    .tv-campaign-name { font-weight: 600; }
    .tv-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .tv-table th, .tv-table td { padding: 0.65rem 1rem; text-align: left; border-bottom: 1px solid var(--tv-border); }
    .tv-table th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--tv-muted); font-weight: 700; background: #f8fafc; }
    .tv-table tbody tr:hover { background: #f8fafc; }

    /* Legacy components */
    .card {
      background: var(--tv-surface);
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1.15rem 1.25rem;
      box-shadow: var(--tv-shadow);
      margin-bottom: 1rem;
    }
    .card-stat .value { font-size: 1.5rem; font-weight: 800; }
    .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--tv-muted); font-weight: 700; margin-bottom: 0.35rem; }
    .value { font-size: 1.1rem; font-weight: 700; }
    .hint { font-size: 0.78rem; color: var(--tv-muted); margin-top: 0.25rem; }
    .grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      margin-bottom: 1rem;
    }
    .grid-stats { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
    .actions-row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0 1.25rem; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.55rem 1rem;
      border-radius: 10px;
      font-size: 0.88rem;
      font-weight: 600;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      font-family: inherit;
      line-height: 1.2;
    }
    .btn:hover { text-decoration: none; }
    .btn-primary { background: var(--tv-primary); color: #fff; border-color: var(--tv-primary-dark); }
    .btn-primary:hover { background: var(--tv-primary-dark); }
    .btn-secondary { background: #fff; color: var(--tv-primary); border-color: var(--tv-border); }
    .btn-secondary:hover { background: var(--tv-bg); }
    .btn-ghost { background: transparent; color: var(--tv-muted); border-color: var(--tv-border); }
    .btn-ghost:hover { background: var(--tv-bg); color: var(--tv-text); }
    .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.8rem; }
    .btn-danger { background: var(--tv-err); color: #fff; }
    .logout-form { display: inline; margin: 0; }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-ok { background: #d1fae5; color: #047857; }
    .badge-warn { background: #fef3c7; color: #b45309; }
    .badge-err { background: #fee2e2; color: #b91c1c; }
    .badge-muted { background: #f1f5f9; color: #64748b; }
    .alert { padding: 0.85rem 1rem; border-radius: 10px; margin-bottom: 1rem; font-size: 0.9rem; }
    .alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }
    .alert-success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; }
    .alert-warn { background: #fffbeb; border: 1px solid #fde68a; color: #b45309; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { padding: 0.6rem 0.85rem; text-align: left; border-bottom: 1px solid var(--tv-border); }
    th { font-size: 0.7rem; text-transform: uppercase; color: var(--tv-muted); font-weight: 700; background: #f8fafc; }
    tbody tr:hover { background: #f8fafc; }
    .row-link { font-weight: 600; }
    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      max-width: 480px;
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--tv-border);
      border-radius: 10px;
      font-size: 0.95rem;
      font-family: inherit;
    }
    .form-group textarea { min-height: 100px; resize: vertical; }
    .field-hint { font-size: 0.8rem; color: var(--tv-muted); margin: 0.35rem 0 0; }
    .meta-grid { display: grid; gap: 0.85rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .meta-item dt { font-size: 0.68rem; text-transform: uppercase; color: var(--tv-muted); font-weight: 700; }
    .meta-item dd { margin: 0.2rem 0 0; font-weight: 600; word-break: break-word; }
    .message-box {
      background: #f8fafc;
      border: 1px solid var(--tv-border);
      border-radius: 0.6rem;
      padding: 0.85rem 1rem;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.92rem;
    }
    .dlr-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.25rem; }
    .tv-btn-campaign {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.45rem 0.9rem;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--tv-primary), var(--tv-purple-soft));
      color: #fff;
      font-size: 0.85rem;
      font-weight: 700;
      text-decoration: none;
      border: none;
      white-space: nowrap;
    }
    .tv-btn-campaign:hover { opacity: 0.92; text-decoration: none; color: #fff; }

    @media (max-width: 1100px) {
      .tv-dash-grid, .tv-dash-grid--2 { grid-template-columns: 1fr; }
      .tv-topbar__search { max-width: 200px; }
    }
    @media (max-width: 900px) {
      .tv-sidebar {
        transform: translateX(-100%);
        transition: transform 0.2s ease;
      }
      .tv-app.tv-app--sidebar-open .tv-sidebar { transform: translateX(0); }
      .tv-app.tv-app--sidebar-open .tv-overlay { display: block; }
      .tv-main { margin-left: 0; }
      .tv-topbar__menu { display: flex; }
      .tv-topbar__pills .tv-pill span.tv-pill__text { display: none; }
      .tv-topbar__search { display: none; }
      .tv-user__meta { display: none; }
      .tv-kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 520px) {
      .tv-kpi-grid { grid-template-columns: 1fr; }
      .tv-content { padding: 1rem; }
      .tv-topbar { padding: 0 0.75rem; gap: 0.4rem; }
      table { min-width: 560px; font-size: 0.78rem; }
    }

    /* —— Secciones etapa 2 —— */
    .tv-page-head--row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }
    .tv-page-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .tv-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--tv-border);
      padding-bottom: 0.5rem;
    }
    .tv-tab {
      border: none;
      background: transparent;
      padding: 0.45rem 0.75rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--tv-muted);
      cursor: pointer;
      font-family: inherit;
    }
    .tv-tab--active { background: #eef2ff; color: var(--tv-primary); }
    .tv-tab__count {
      margin-left: 0.35rem;
      background: var(--tv-bg);
      padding: 0.1rem 0.4rem;
      border-radius: 6px;
      font-size: 0.72rem;
    }
    .tv-mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 0.65rem;
      margin-bottom: 1rem;
    }
    .tv-mode-card {
      text-align: left;
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 0.85rem;
      background: var(--tv-surface);
      cursor: pointer;
      font-family: inherit;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .tv-mode-card--active {
      border-color: var(--tv-primary);
      box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.12);
    }
    .tv-mode-card__icon { color: var(--tv-primary); font-size: 1.35rem; display: block; margin-bottom: 0.35rem; }
    .tv-mode-card__label { display: block; font-weight: 700; font-size: 0.88rem; }
    .tv-mode-card__desc { display: block; font-size: 0.75rem; color: var(--tv-muted); margin-top: 0.25rem; line-height: 1.35; }
    .tv-send-layout { display: grid; grid-template-columns: 1fr 300px; gap: 1.25rem; align-items: start; }
    .tv-send-aside { display: flex; flex-direction: column; gap: 1rem; }
    .tv-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .tv-form-grid--compact { margin-top: 0.5rem; }
    .tv-input-full { max-width: none !important; width: 100%; }
    .tv-var-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; }
    .tv-var-chip {
      border: 1px dashed var(--tv-border);
      background: var(--tv-bg);
      border-radius: 6px;
      padding: 0.2rem 0.5rem;
      font-size: 0.78rem;
      cursor: pointer;
      font-family: inherit;
    }
    .tv-stat-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem; }
    .tv-stat-chip {
      padding: 0.5rem 0.65rem;
      border-radius: 10px;
      background: var(--tv-bg);
      border: 1px solid var(--tv-border);
    }
    .tv-stat-chip__label { display: block; font-size: 0.65rem; text-transform: uppercase; color: var(--tv-muted); font-weight: 700; }
    .tv-stat-chip__value { font-weight: 800; font-size: 0.95rem; }
    .tv-stat-chip--success .tv-stat-chip__value { color: var(--tv-ok); }
    .tv-stat-chip--primary .tv-stat-chip__value { color: var(--tv-primary); }
    .tv-stat-chip--warn .tv-stat-chip__value { color: var(--tv-warn); }
    .tv-notice-block { font-size: 0.82rem; margin: 0; background: #f0f7ff; border-color: #bfdbfe; color: #1e40af; }
    .tv-phone {
      width: 200px;
      margin: 0 auto;
      border: 2px solid #1e293b;
      border-radius: 24px;
      overflow: hidden;
      background: #f1f5f9;
    }
    .tv-phone__bar {
      display: flex;
      justify-content: space-between;
      padding: 0.35rem 0.65rem;
      font-size: 0.65rem;
      background: #e2e8f0;
    }
    .tv-phone__header {
      text-align: center;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.35rem;
      background: #fff;
      border-bottom: 1px solid var(--tv-border);
    }
    .tv-phone__body { padding: 0.75rem; min-height: 100px; }
    .tv-phone__bubble {
      background: #e8eef8;
      border: 1px solid #cbd5e1;
      border-radius: 14px 14px 14px 4px;
      padding: 0.55rem 0.65rem;
      font-size: 0.78rem;
      line-height: 1.4;
      word-break: break-word;
    }
    .tv-tips-list { margin: 0; padding-left: 1.1rem; font-size: 0.85rem; color: var(--tv-muted); }
    .tv-tips-list li { margin-bottom: 0.35rem; }
    .tv-mock-tag { margin-top: 0.75rem; font-style: italic; }
    .tv-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .tv-filter-input {
      padding: 0.45rem 0.65rem;
      border: 1px solid var(--tv-border);
      border-radius: 8px;
      font-size: 0.85rem;
      min-width: 120px;
      font-family: inherit;
    }
    .tv-inbox-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 1rem;
      align-items: start;
    }
    .tv-inbox-row { cursor: pointer; }
    .tv-inbox-row--active td { background: #eef2ff !important; }
    .tv-inbox-msg { max-width: 220px; }
    .tv-detail-list { display: grid; gap: 0.65rem; margin: 0; }
    .tv-detail-list div { display: grid; gap: 0.2rem; }
    .tv-detail-list dt { font-size: 0.68rem; text-transform: uppercase; color: var(--tv-muted); font-weight: 700; }
    .tv-detail-list dd { margin: 0; font-size: 0.88rem; }
    .tv-detail__title { margin: 0 0 0.75rem; font-size: 1rem; }
    .tv-sms-thread { display: flex; flex-direction: column; gap: 0.75rem; }
    .tv-sms-thread__msg { display: flex; flex-direction: column; max-width: 85%; }
    .tv-sms-thread__msg--out { align-self: flex-end; align-items: flex-end; }
    .tv-sms-thread__msg--in { align-self: flex-start; }
    .tv-sms-thread__meta { font-size: 0.68rem; color: var(--tv-muted); margin-bottom: 0.2rem; }
    .tv-sms-thread__bubble {
      padding: 0.55rem 0.7rem;
      border-radius: 12px;
      font-size: 0.85rem;
      background: #e8eef8;
      border: 1px solid #cbd5e1;
    }
    .tv-sms-thread__msg--out .tv-sms-thread__bubble {
      background: linear-gradient(135deg, #dbeafe, #e0e7ff);
    }
    .tv-code {
      border: 1px solid var(--tv-border);
      border-radius: 10px;
      overflow: hidden;
      background: #0f172a;
    }
    .tv-code__title {
      padding: 0.4rem 0.75rem;
      background: #1e293b;
      color: #94a3b8;
      font-size: 0.72rem;
      font-weight: 600;
    }
    .tv-code pre { margin: 0; padding: 1rem; color: #e2e8f0; font-size: 0.78rem; overflow-x: auto; }
    .tv-endpoint-grid { display: grid; gap: 0.65rem; }
    .tv-endpoint-card {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.75rem;
      border: 1px solid var(--tv-border);
      border-radius: 10px;
      background: var(--tv-bg);
    }
    .tv-endpoint-card code { display: block; font-size: 0.78rem; margin-top: 0.2rem; word-break: break-all; }
    .tv-tag {
      display: inline-block;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 6px;
      margin-left: 0.35rem;
    }
    .tv-tag--ok { background: #d1fae5; color: #047857; }
    .tv-tag--warn { background: #fef3c7; color: #b45309; }
    .tv-tag--muted { background: #f1f5f9; color: #64748b; }
    .tv-details { margin-top: 1.25rem; border: 1px solid var(--tv-border); border-radius: var(--tv-radius); }
    .tv-details summary {
      padding: 0.85rem 1rem;
      cursor: pointer;
      font-weight: 600;
      background: var(--tv-bg);
    }
    .tv-details__body { padding: 1rem; }
    .tv-bot-layout { display: grid; grid-template-columns: 1.2fr 1fr; gap: 1.25rem; }
    .tv-bot-chat__body { max-height: 280px; overflow-y: auto; }
    .tv-chat-msg { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; align-items: flex-start; }
    .tv-chat-msg--user { justify-content: flex-end; }
    .tv-chat-msg__avatar {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--tv-primary), var(--tv-purple-soft));
      color: #fff;
      font-size: 0.7rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .tv-chat-msg__bubble {
      max-width: 85%;
      padding: 0.6rem 0.75rem;
      border-radius: 12px;
      font-size: 0.88rem;
      line-height: 1.45;
      background: var(--tv-bg);
      border: 1px solid var(--tv-border);
    }
    .tv-chat-msg--user .tv-chat-msg__bubble {
      background: linear-gradient(135deg, #dbeafe, #e0e7ff);
    }
    .tv-bot-quick {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--tv-border);
    }
    .tv-bot-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.35rem 0.6rem;
      border-radius: 999px;
      border: 1px solid var(--tv-border);
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--tv-text);
      text-decoration: none;
      background: #fff;
    }
    .tv-bot-chip:hover { background: var(--tv-bg); text-decoration: none; }
    .tv-bot-compose {
      display: flex;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--tv-border);
    }
    .tv-bot-compose input { flex: 1; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid var(--tv-border); }
    .tv-tips-grid { display: grid; gap: 0.5rem; }
    .tv-tip-card {
      display: flex;
      gap: 0.5rem;
      padding: 0.65rem;
      background: var(--tv-bg);
      border-radius: 10px;
      font-size: 0.82rem;
    }
    .tv-tip-card .material-symbols-outlined { color: var(--tv-purple-soft); font-size: 1.1rem; }
    .tv-form-inline { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-top: 0.75rem; }
    .tv-panel__body--center { display: flex; justify-content: center; }
    .tv-table--compact th, .tv-table--compact td { padding: 0.45rem 0.65rem; }
    @media (max-width: 1000px) {
      .tv-send-layout, .tv-inbox-layout, .tv-bot-layout { grid-template-columns: 1fr; }
      .tv-inbox-detail-panel { order: -1; }
    }
    @media (max-width: 600px) {
      .tv-form-grid { grid-template-columns: 1fr; }
      .tv-mode-grid { grid-template-columns: 1fr 1fr; }
    }

    /* —— Etapa 3 —— */
    .tv-filters--wrap { align-items: flex-end; }
    .tv-filter-field { display: flex; flex-direction: column; gap: 0.25rem; }
    .tv-filter-field__label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: var(--tv-muted); }
    .tv-filter-input--grow { flex: 1; min-width: 180px; }
    .tv-filter-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .tv-charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .tv-mini-chart {
      background: var(--tv-surface);
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 0.85rem;
      box-shadow: var(--tv-shadow);
    }
    .tv-mini-chart__title { font-size: 0.78rem; font-weight: 700; margin-bottom: 0.65rem; color: var(--tv-muted); }
    .tv-mini-chart__bars { display: flex; align-items: flex-end; gap: 0.35rem; height: 72px; }
    .tv-mini-chart__col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
    .tv-mini-chart__bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .tv-mini-chart__bar {
      width: 70%;
      max-width: 24px;
      border-radius: 6px 6px 2px 2px;
      min-height: 4px;
      background: linear-gradient(180deg, var(--tv-primary-light), var(--tv-primary));
    }
    .tv-mini-chart__bar--success { background: linear-gradient(180deg, #34d399, var(--tv-ok)); }
    .tv-mini-chart__bar--purple { background: linear-gradient(180deg, #a78bfa, var(--tv-purple-soft)); }
    .tv-mini-chart__bar--warn { background: linear-gradient(180deg, #fbbf24, var(--tv-warn)); }
    .tv-mini-chart__label { font-size: 0.62rem; color: var(--tv-muted); margin-top: 0.25rem; }
    .tv-insights { list-style: none; margin: 0; padding: 0; }
    .tv-insight {
      display: flex;
      gap: 0.5rem;
      padding: 0.65rem 0;
      border-bottom: 1px solid var(--tv-border);
      font-size: 0.88rem;
    }
    .tv-insight:last-child { border-bottom: none; }
    .tv-insight .material-symbols-outlined { color: var(--tv-purple-soft); font-size: 1.15rem; flex-shrink: 0; }
    .tv-list-grid { display: grid; gap: 0.65rem; }
    .tv-list-card {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--tv-border);
      border-radius: 10px;
      background: var(--tv-bg);
    }
    .tv-list-card__count { margin-left: 0.5rem; font-size: 0.8rem; color: var(--tv-muted); font-weight: 500; }
    .tv-list-card__meta { font-size: 0.78rem; color: var(--tv-muted); }
    .tv-list-card__actions { display: flex; gap: 0.35rem; }
    .tv-bags-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
    .tv-bag-card {
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1rem;
      background: var(--tv-bg);
    }
    .tv-bag-card h3 { margin: 0 0 0.65rem; font-size: 0.95rem; }
    .tv-panel--cta .tv-cta-card { text-align: center; padding: 0.5rem 0; }
    .tv-panel--cta h2 { margin: 0 0 0.5rem; }
    .tv-panel--cta p { color: var(--tv-muted); margin: 0 0 1rem; max-width: 520px; margin-left: auto; margin-right: auto; }
    .tv-templates-layout {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 1rem;
      align-items: start;
    }
    .tv-templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 0.85rem;
    }
    .tv-template-card {
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1rem;
      background: var(--tv-surface);
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .tv-template-card--active {
      border-color: var(--tv-primary);
      box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.1);
    }
    .tv-template-card__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
    .tv-template-card__head h3 { margin: 0; font-size: 0.95rem; }
    .tv-template-card__cat { font-size: 0.75rem; color: var(--tv-muted); margin: 0.25rem 0; }
    .tv-template-card__msg { font-size: 0.85rem; margin: 0.5rem 0; line-height: 1.4; color: var(--tv-text); }
    .tv-template-card__meta { font-size: 0.72rem; color: var(--tv-muted); }
    .tv-template-card__actions { display: flex; gap: 0.35rem; margin-top: 0.75rem; flex-wrap: wrap; }
    .tv-chat-layout {
      display: grid;
      grid-template-columns: 260px 1fr 280px;
      gap: 1rem;
      align-items: stretch;
      min-height: 480px;
    }
    .tv-chat-list .tv-panel__body--flush { padding: 0; max-height: 520px; overflow-y: auto; }
    .tv-chat-ticket {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
      width: 100%;
      padding: 0.75rem 1rem;
      border: none;
      border-bottom: 1px solid var(--tv-border);
      background: transparent;
      text-align: left;
      cursor: pointer;
      font-family: inherit;
    }
    .tv-chat-ticket:hover { background: var(--tv-bg); }
    .tv-chat-ticket.tv-inbox-row--active { background: #eef2ff; }
    .tv-chat-ticket__subject { font-weight: 600; font-size: 0.88rem; }
    .tv-chat-ticket__meta { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .tv-chat-ticket__time { font-size: 0.72rem; color: var(--tv-muted); }
    .tv-chat-main { display: flex; flex-direction: column; }
    .tv-chat-messages { flex: 1; max-height: 320px; overflow-y: auto; }
    .tv-chat-meta-panel .tv-panel__body { font-size: 0.88rem; }
    @media (max-width: 1100px) {
      .tv-templates-layout, .tv-chat-layout { grid-template-columns: 1fr; }
      .tv-chat-meta-panel, .tv-template-editor-panel { order: -1; }
    }
    .tv-superadmin-banner {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      border-radius: var(--tv-radius);
      border: 1px solid rgba(0, 82, 204, 0.2);
      background: linear-gradient(135deg, #f0f7ff 0%, #faf5ff 100%);
      font-size: 0.88rem;
    }
    .tv-superadmin-banner .material-symbols-outlined {
      color: var(--tv-primary);
      font-size: 1.5rem;
    }
    .tv-superadmin-banner strong { display: block; font-size: 0.92rem; margin-bottom: 0.15rem; }
    .tv-superadmin-banner span { color: var(--tv-muted); display: block; }
    .tv-superadmin-banner__note { margin-top: 0.35rem; font-size: 0.82rem; color: var(--tv-text); }
    .tv-future-panel {
      display: flex;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      margin-bottom: 1rem;
      border: 1px dashed var(--tv-border);
      border-radius: var(--tv-radius);
      background: var(--tv-surface);
      font-size: 0.85rem;
    }
    .tv-future-panel .material-symbols-outlined { color: var(--tv-purple-soft); }
    .tv-future-panel p { margin: 0.25rem 0 0; color: var(--tv-muted); }
    .tv-future-panel code { font-size: 0.82rem; }
    .tv-kpi-grid--dense { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
    .tv-charts-grid--inline { margin-top: 1rem; grid-template-columns: 1fr; }
    .tv-mock-tag { margin-top: 0.75rem; font-size: 0.78rem; color: var(--tv-muted); }
    .badge-ok { background: #ecfdf5; color: #047857; }
    .badge-warn { background: #fffbeb; color: #b45309; }
    .badge-err { background: #fef2f2; color: #b91c1c; }
    .badge-muted { background: #f1f5f9; color: #64748b; }
    .tv-pill--role {
      background: linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%);
      border-color: rgba(99, 102, 241, 0.25);
      color: #4338ca;
      font-weight: 600;
      font-size: 0.72rem;
    }
    .tv-forbidden, .tv-app-placeholder {
      min-height: 60vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .tv-forbidden__card, .tv-app-placeholder__card {
      max-width: 480px;
      text-align: center;
      padding: 2rem;
      border-radius: var(--tv-radius);
      border: 1px solid var(--tv-border);
      background: var(--tv-surface);
      box-shadow: var(--tv-shadow);
    }
    .tv-forbidden__icon, .tv-app-placeholder__icon {
      font-size: 3rem;
      color: var(--tv-err);
      margin-bottom: 0.75rem;
    }
    .tv-app-placeholder__icon { color: var(--tv-primary); }
    .tv-forbidden__title { margin: 0 0 0.5rem; font-size: 1.35rem; }
    .tv-forbidden__text, .tv-app-placeholder__note {
      color: var(--tv-muted);
      margin: 0 0 1.25rem;
      line-height: 1.5;
    }
    .tv-forbidden__actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
    .tv-app-placeholder__routes {
      text-align: left;
      margin: 1rem 0;
      padding-left: 1.25rem;
      color: var(--tv-muted);
      font-size: 0.85rem;
    }
    .tv-app-placeholder__meta { font-size: 0.82rem; color: var(--tv-muted); margin-bottom: 0.75rem; }
    ${getOrderUiSharedStyles()}
  `;
}
