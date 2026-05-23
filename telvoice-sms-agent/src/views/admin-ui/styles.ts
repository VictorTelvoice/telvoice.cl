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
    .tv-sidebar__brand a {
      color: #fff;
      text-decoration: none;
      display: block;
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
    }
    .tv-sidebar__brand span {
      display: block;
      font-size: 0.72rem;
      font-weight: 600;
      color: rgba(255,255,255,0.55);
      margin-top: 0.2rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
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
    .tv-auth-logo {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: linear-gradient(135deg, var(--tv-primary), var(--tv-purple-soft));
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.95rem;
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
  `;
}
