/** Estilos compartidos — módulo Agente / Numeraciones / SMS entrantes (cliente + admin). */
export function renderAgentModuleStyles(): string {
  return `<style>
    .tv-agent-hero {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1rem;
      border-radius: 10px;
      border: 1px solid var(--tv-border, rgba(15,23,42,0.08));
      background: var(--tv-panel-bg, #fff);
    }
    .tv-agent-hero--active {
      border-color: rgba(34,197,94,0.35);
      background: linear-gradient(135deg, rgba(34,197,94,0.06), rgba(59,130,246,0.04));
    }
    .tv-agent-hero--empty {
      border-style: dashed;
      opacity: 0.95;
    }
    .tv-agent-hero__icon {
      flex-shrink: 0;
      width: 2.75rem;
      height: 2.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: rgba(59,130,246,0.1);
      color: var(--tv-accent, #2563eb);
    }
    .tv-agent-hero__icon .material-symbols-outlined { font-size: 1.6rem; }
    .tv-agent-hero__title { margin: 0 0 0.35rem; font-size: 1.2rem; font-weight: 700; }
    .tv-agent-hero__text { margin: 0; line-height: 1.55; opacity: 0.88; max-width: 42rem; }
    .tv-agent-hero__meta { margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }

    .tv-agent-empty {
      text-align: center;
      padding: 2.5rem 1.5rem;
      border-radius: 10px;
      border: 1px dashed var(--tv-border, rgba(15,23,42,0.12));
      margin-bottom: 1rem;
    }
    .tv-agent-empty__icon .material-symbols-outlined { font-size: 2.75rem; opacity: 0.45; }
    .tv-agent-empty__title { margin: 0.75rem 0 0.5rem; font-size: 1.15rem; }
    .tv-agent-empty__text { margin: 0 auto 1.25rem; max-width: 34rem; line-height: 1.55; opacity: 0.85; }
    .tv-agent-empty__actions { display: flex; gap: 0.65rem; justify-content: center; flex-wrap: wrap; }

    .tv-agent-quick-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.65rem;
      margin-top: 1rem;
    }
    .tv-agent-quick-card {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding: 0.85rem 1rem;
      border-radius: 8px;
      border: 1px solid var(--tv-border, rgba(15,23,42,0.08));
      text-decoration: none;
      color: inherit;
      background: var(--tv-panel-bg, #fff);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .tv-agent-quick-card:hover {
      border-color: rgba(59,130,246,0.35);
      box-shadow: 0 2px 8px rgba(15,23,42,0.06);
    }
    .tv-agent-quick-card .material-symbols-outlined { font-size: 1.25rem; opacity: 0.75; }
    .tv-agent-quick-card strong { font-size: 0.9rem; }
    .tv-agent-quick-card span { font-size: 0.78rem; opacity: 0.65; }

    .tv-agent-kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }
    .tv-agent-kpi {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.75rem;
      border-radius: 8px;
      background: rgba(15,23,42,0.03);
    }
    .tv-agent-kpi__label {
      font-size: 0.72rem;
      opacity: 0.65;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .tv-agent-kpi strong { font-size: 1rem; }
    .tv-agent-kpi small { font-size: 0.8rem; opacity: 0.7; }

    .tv-agent-funcs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.5rem;
    }
    .tv-agent-func {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.88rem;
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      opacity: 0.5;
    }
    .tv-agent-func--on {
      opacity: 1;
      background: rgba(34,197,94,0.08);
    }
    .tv-agent-func .material-symbols-outlined { font-size: 1.1rem; }

    .tv-recent-sms-list { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .tv-recent-sms-item {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.65rem 0.75rem;
      border-radius: 6px;
      background: rgba(15,23,42,0.03);
      font-size: 0.88rem;
    }
    .tv-recent-sms-item small { opacity: 0.65; white-space: nowrap; }

    .tv-qa-lab-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.45rem;
      border-radius: 999px;
      background: rgba(245,158,11,0.15);
      color: #b45309;
      border: 1px solid rgba(245,158,11,0.35);
      vertical-align: middle;
      margin-left: 0.35rem;
    }

    .tv-otp-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: rgba(59,130,246,0.12);
      color: var(--tv-accent, #2563eb);
      border: 1px solid rgba(59,130,246,0.2);
    }
    .tv-otp-pill code {
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      background: transparent;
      padding: 0;
    }

    .tv-agent-plan-card--active-plan {
      border-color: rgba(34,197,94,0.45) !important;
      box-shadow: 0 0 0 1px rgba(34,197,94,0.12);
    }
    .tv-agent-plan-card__active-badge {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: rgba(34,197,94,0.15);
      color: #15803d;
      font-weight: 700;
    }

    .tv-admin-detail-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--tv-border, rgba(15,23,42,0.08));
    }
    .tv-admin-detail-actions .field-hint { width: 100%; margin: 0.25rem 0 0; }

    .tv-sms-inbox-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: flex-end;
      margin-bottom: 1rem;
      padding: 1rem;
      border-radius: 8px;
      background: var(--tv-panel-bg, rgba(255,255,255,0.04));
      border: 1px solid var(--tv-border, rgba(15,23,42,0.06));
    }
    .tv-sms-inbox-layout {
      display: grid;
      grid-template-columns: 220px 1fr 320px;
      gap: 1rem;
      min-height: 28rem;
    }
    @media (max-width: 1100px) {
      .tv-sms-inbox-layout { grid-template-columns: 1fr; }
      .tv-sms-inbox-detail { order: 3; }
    }
    .tv-sms-inbox-sidebar,
    .tv-sms-inbox-list,
    .tv-sms-inbox-detail {
      background: var(--tv-panel-bg, #fff);
      border: 1px solid var(--tv-border, rgba(15,23,42,0.08));
      border-radius: 8px;
    }
    .tv-sms-inbox-sidebar { padding: 1rem; }
    .tv-sms-inbox-sidebar__title {
      font-size: 0.78rem;
      margin: 0 0 0.75rem;
      opacity: 0.65;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .tv-sms-inbox-nav { display: flex; flex-direction: column; gap: 0.35rem; }
    .tv-sms-inbox-nav__item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      text-decoration: none;
      color: inherit;
      font-size: 0.9rem;
    }
    .tv-sms-inbox-nav__item:hover,
    .tv-sms-inbox-nav__item--active { background: rgba(59,130,246,0.08); }
    .tv-sms-inbox-list { overflow-y: auto; max-height: 32rem; }
    .tv-sms-inbox-msg {
      display: block;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--tv-border, rgba(15,23,42,0.06));
      text-decoration: none;
      color: inherit;
    }
    .tv-sms-inbox-msg--active { background: rgba(59,130,246,0.06); }
    .tv-sms-inbox-msg--unread { border-left: 3px solid var(--tv-accent, #2563eb); }
    .tv-sms-inbox-msg__head { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.9rem; }
    .tv-sms-inbox-msg__to { font-size: 0.8rem; opacity: 0.65; margin: 0.15rem 0; }
    .tv-sms-inbox-msg__body { font-size: 0.85rem; opacity: 0.85; line-height: 1.45; }
    .tv-sms-inbox-empty {
      text-align: center;
      padding: 3rem 1.5rem;
      opacity: 0.85;
      line-height: 1.55;
    }
    .tv-sms-inbox-empty .material-symbols-outlined { font-size: 2.5rem; opacity: 0.45; display: block; margin-bottom: 0.5rem; }
    .tv-sms-inbox-detail { padding: 1rem; }
    .tv-sms-inbox-detail--empty { display: flex; align-items: center; justify-content: center; opacity: 0.6; min-height: 12rem; }
    .tv-sms-inbox-detail__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: 0.5rem; }
    .tv-sms-inbox-detail__head h3 { margin: 0; font-size: 1rem; }
    .tv-sms-inbox-detail__meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.35rem 1rem;
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }
    .tv-sms-inbox-detail__meta dt { opacity: 0.65; font-weight: 500; }
    .tv-sms-inbox-detail__otp {
      margin-bottom: 1rem;
      padding: 0.85rem 1rem;
      border-radius: 8px;
      background: rgba(59,130,246,0.08);
      border: 1px solid rgba(59,130,246,0.15);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.65rem;
    }
    .tv-sms-inbox-detail__otp-label { font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; width: 100%; }
    .tv-sms-inbox-detail__otp-code { font-size: 1.35rem; font-weight: 700; letter-spacing: 0.12em; }
    .tv-sms-inbox-detail__body { margin-bottom: 1rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; padding: 0.75rem; border-radius: 6px; background: rgba(15,23,42,0.03); }
    .tv-sms-inbox-detail__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

    .tv-numeraciones-table .tv-table-actions { white-space: nowrap; }
    .tv-numeraciones-caps { font-size: 0.85rem; line-height: 1.45; }
    .tv-numeraciones-empty {
      text-align: center;
      padding: 3rem 2rem;
      border-radius: 10px;
    }
    .tv-numeraciones-empty__icon .material-symbols-outlined { font-size: 3rem; opacity: 0.45; }
    .tv-numeraciones-empty__title { margin: 1rem 0 0.5rem; font-size: 1.2rem; }
    .tv-numeraciones-empty__text { max-width: 36rem; margin: 0 auto 1.5rem; line-height: 1.55; opacity: 0.85; }
    .tv-numeraciones-empty__actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }

    .tv-agent-plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; }
    .tv-agent-plan-card {
      position: relative;
      border-radius: 10px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--tv-border, rgba(15,23,42,0.08));
      background: var(--tv-panel-bg, #fff);
    }
    .tv-agent-plan-card--selected { border-color: rgba(59,130,246,0.45); box-shadow: 0 0 0 1px rgba(59,130,246,0.12); }
    .tv-agent-plan-card__head h3 { margin: 0 0 0.5rem; }
    .tv-agent-plan-card__price { font-size: 1.5rem; font-weight: 700; }
    .tv-agent-plan-card__price span { font-size: 0.85rem; font-weight: 400; opacity: 0.7; }
    .tv-agent-plan-card__features { flex: 1; margin: 1rem 0; padding-left: 1.25rem; font-size: 0.9rem; line-height: 1.6; }
    .tv-agent-plan-card__notice { font-size: 0.85rem; line-height: 1.45; margin: 0 0 0.75rem; padding: 0.65rem 0.75rem; border-radius: 6px; background: rgba(15,23,42,0.04); }
    .tv-agent-plan-card__cta { margin-top: auto; display: flex; flex-direction: column; gap: 0.75rem; }
    .tv-agent-plans-note {
      margin-top: 1.5rem;
      font-size: 0.85rem;
      line-height: 1.55;
      opacity: 0.75;
      max-width: 48rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      background: rgba(15,23,42,0.03);
      border-left: 3px solid var(--tv-accent, #2563eb);
    }

    .tv-admin-num-form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      align-items: end;
    }
    .tv-admin-num-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 500; }
    .tv-dl-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; font-size: 0.9rem; }
    .tv-dl-grid dt { opacity: 0.65; font-weight: 500; }
    .tv-admin-activate-form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: flex-end;
      margin-top: 0.5rem;
      padding: 0.85rem;
      border-radius: 8px;
      background: rgba(34,197,94,0.05);
      border: 1px solid rgba(34,197,94,0.15);
    }
    .tv-admin-activate-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; min-width: 220px; }
    .tv-sms-snippet { max-width: 16rem; font-size: 0.85rem; line-height: 1.4; }
    .tv-agent-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 800px) { .tv-agent-grid { grid-template-columns: 1fr; } }
  </style>`;
}

/** Badge visual para numeraciones de laboratorio/QA. */
export function renderQaLabBadge(provider: string | null | undefined): string {
  if (!provider || !/qa|lab/i.test(provider)) return "";
  return `<span class="tv-qa-lab-badge" title="Numeración de prueba — no productiva">QA Lab</span>`;
}
