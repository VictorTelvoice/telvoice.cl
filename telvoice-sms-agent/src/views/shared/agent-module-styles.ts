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

    /* ── SMS Entrantes (cliente) ── */
    .tv-sms-in-live {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .tv-sms-in-live__dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      animation: tv-sms-in-pulse 2s ease-in-out infinite;
    }
    @keyframes tv-sms-in-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
    }
    .tv-sms-in-source { margin-left: 0.35rem; }

    .tv-sms-in-lines {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      margin-bottom: 1.25rem;
    }
    .tv-sms-in-line {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.55rem 0.95rem;
      border-radius: 999px;
      border: 1px solid var(--tv-border, rgba(15, 23, 42, 0.14));
      background: var(--tv-panel-bg, #fff);
      color: #0f172a;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.2;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .tv-sms-in-line:hover {
      border-color: rgba(15, 23, 42, 0.28);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
    }
    .tv-sms-in-line--active {
      background: var(--tv-panel-bg, #fff);
      border: 2px solid #0f172a;
      padding: calc(0.55rem - 1px) calc(0.95rem - 1px);
      color: #0f172a;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
    }
    .tv-sms-in-line__icon {
      font-size: 1.05rem;
      color: #0f172a;
      opacity: 0.55;
    }
    .tv-sms-in-line--active .tv-sms-in-line__icon {
      opacity: 0.85;
    }
    .tv-sms-in-line__num {
      letter-spacing: 0.01em;
      white-space: nowrap;
      color: #0f172a;
    }
    .tv-sms-in-line__badge {
      min-width: 1.25rem;
      height: 1.25rem;
      padding: 0 0.35rem;
      border-radius: 999px;
      background: #ef4444;
      color: #fff;
      font-size: 0.68rem;
      font-weight: 700;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .tv-sms-in-layout {
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    .tv-sms-in-empty {
      text-align: center;
      padding: 3rem 1.5rem;
      width: 100%;
      max-width: 36rem;
    }
    .tv-sms-in-empty__icon .material-symbols-outlined {
      font-size: 2.75rem;
      opacity: 0.45;
    }
    .tv-sms-in-empty__actions {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 1.25rem;
    }

    .tv-sms-in-phone-wrap {
      display: flex;
      justify-content: center;
      width: 100%;
      max-width: 360px;
    }
    .tv-sms-in-phone.tv-hero-phone {
      width: 100%;
      max-width: 320px;
      height: 640px;
      max-height: min(640px, 72vh);
      border: 12px solid #dae2fd;
      border-radius: 48px;
      background: #131b2e;
      box-shadow:
        0 20px 60px -15px rgba(0, 0, 0, 0.35),
        0 0 0 1px rgba(129, 140, 248, 0.12),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }
    .tv-sms-in-phone .tv-hero-phone__notch {
      width: 36%;
      height: 24px;
      background: #dae2fd;
      border-radius: 0 0 16px 16px;
    }
    .tv-sms-in-phone .tv-hero-phone__screen {
      background: linear-gradient(180deg, #f8fafd 0%, #eef3fa 100%);
      min-height: 0;
      flex: 1;
      padding: 3.1rem 0.85rem 1rem;
      display: flex;
      flex-direction: column;
    }
    .tv-sms-in-phone-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.85rem 1rem 0.75rem;
      border-bottom: 1px solid rgba(203, 213, 225, 0.6);
      background: rgba(255, 255, 255, 0.65);
    }
    .tv-sms-in-phone-head__brand {
      display: flex;
      align-items: center;
      gap: 0.55rem;
    }
    .tv-sms-in-phone-head__logo {
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: linear-gradient(135deg, #0ea5e9, #0052cc);
      color: #fff;
      font-size: 1.1rem;
    }
    .tv-sms-in-phone-head__title {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 700;
      color: #131b2e;
    }
    .tv-sms-in-phone-head__line {
      margin: 0.1rem 0 0;
      font-size: 0.72rem;
      color: #475569;
      font-weight: 600;
    }
    .tv-sms-in-phone-status {
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.2rem 0.45rem;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.2);
      color: #64748b;
      white-space: nowrap;
    }
    .tv-sms-in-phone-status--ok {
      background: rgba(34, 197, 94, 0.15);
      color: #15803d;
    }
    .tv-sms-in-feed {
      flex: 1;
      overflow-y: auto;
      padding: 0.85rem 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      scroll-behavior: smooth;
    }
    .tv-sms-in-feed__empty {
      margin: auto;
      text-align: center;
      font-size: 0.82rem;
      color: #64748b;
      line-height: 1.45;
      padding: 2rem 1rem;
    }
    .tv-sms-in-feed__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.35rem;
      font-size: 0.68rem;
      color: #64748b;
      padding: 0 0.25rem;
    }
    .tv-sms-in-feed__from { font-weight: 600; color: #475569; }
    .tv-sms-in-bubble {
      max-width: 92%;
      word-break: break-word;
    }
    .tv-sms-in-phone .tv-hero-phone__bubble--in {
      background: #e2e8f0;
      color: #0f172a;
      border-radius: 16px 16px 16px 4px;
      font-size: 0.78rem;
      line-height: 1.45;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    .tv-sms-in-bubble--enter {
      animation: tv-sms-in-bubble-in 0.35s ease-out;
    }
    @keyframes tv-sms-in-bubble-in {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .tv-sms-in-feed__item--latest .tv-sms-in-bubble {
      box-shadow: 0 2px 12px rgba(59, 130, 246, 0.15);
    }

    .tv-sms-in-toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 1200;
      padding: 0.75rem 1.1rem;
      border-radius: 8px;
      background: var(--tv-panel-bg, #fff);
      color: var(--tv-text, #0f172a);
      font-size: 0.875rem;
      font-weight: 500;
      border: 1px solid var(--tv-border, rgba(15, 23, 42, 0.12));
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
    }
    .tv-sms-in-toast--visible { opacity: 1; transform: translateY(0); }

    @media (max-width: 960px) {
      .tv-sms-in-phone.tv-hero-phone {
        max-height: min(560px, 65vh);
        height: auto;
        min-height: 480px;
      }
      .tv-sms-in-lines {
        gap: 0.5rem;
      }
      .tv-sms-in-line {
        padding: 0.5rem 0.8rem;
        font-size: 0.82rem;
      }
    }

    .tv-numeraciones-intro {
      margin: 0 0 1.25rem;
      padding: 1rem 1.15rem;
      border-radius: 10px;
      border: 1px solid var(--tv-border, rgba(15,23,42,0.08));
      background: linear-gradient(135deg, rgba(59,130,246,0.05), rgba(15,23,42,0.02));
      font-size: 0.925rem;
      line-height: 1.55;
      opacity: 0.92;
    }
    .tv-numeraciones-kpis { margin-bottom: 1.25rem; }
    .tv-num-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
      gap: 1rem;
    }
    .tv-num-card {
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      border: 1px solid var(--tv-border, rgba(15,23,42,0.1));
      background: var(--tv-panel-bg, #fff);
      box-shadow: 0 1px 2px rgba(15,23,42,0.04);
      overflow: hidden;
    }
    .tv-num-card__head {
      padding: 1.1rem 1.15rem 0.85rem;
      border-bottom: 1px solid var(--tv-border, rgba(15,23,42,0.06));
      background: linear-gradient(180deg, rgba(59,130,246,0.04), transparent);
    }
    .tv-num-card__number {
      margin: 0 0 0.65rem;
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      font-variant-numeric: tabular-nums;
    }
    .tv-num-card__badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
    }
    .tv-num-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.22rem 0.55rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1.2;
    }
    .tv-num-chip--type-sim {
      background: rgba(59,130,246,0.12);
      color: #1d4ed8;
    }
    .tv-num-chip--type-line {
      background: rgba(100,116,139,0.12);
      color: #475569;
    }
    .tv-num-chip--country {
      background: rgba(14,165,233,0.1);
      color: #0369a1;
    }
    .tv-num-chip--cap {
      background: rgba(15,23,42,0.05);
      color: #334155;
    }
    .tv-num-chip--cap-api {
      background: rgba(6,182,212,0.12);
      color: #0e7490;
    }
    .tv-num-chip--cap-otp {
      background: rgba(168,85,247,0.1);
      color: #7e22ce;
    }
    .tv-num-chip--agent-yes {
      background: rgba(34,197,94,0.12);
      color: #047857;
    }
    .tv-num-chip--agent-no {
      background: rgba(100,116,139,0.1);
      color: #64748b;
    }
    .tv-num-chip--plan-none {
      background: rgba(245,158,11,0.14);
      color: #b45309;
    }
    .tv-num-card__plan-hint {
      margin: 0 0 0.85rem;
      padding: 0.65rem 0.75rem;
      border-radius: 0.55rem;
      background: rgba(245,158,11,0.08);
      border: 1px solid rgba(245,158,11,0.18);
      color: #92400e;
      font-size: 0.8125rem;
      line-height: 1.45;
    }
    .tv-num-card__body { padding: 0.95rem 1.15rem; flex: 1; }
    .tv-num-card__meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.45rem 0.85rem;
      margin: 0 0 0.85rem;
      font-size: 0.875rem;
    }
    .tv-num-card__meta dt {
      margin: 0;
      opacity: 0.62;
      font-weight: 500;
      white-space: nowrap;
    }
    .tv-num-card__meta dd {
      margin: 0;
      font-weight: 500;
      line-height: 1.4;
      word-break: break-word;
    }
    .tv-num-card__meta dd small {
      display: block;
      margin-top: 0.15rem;
      font-size: 0.78rem;
      font-weight: 400;
      opacity: 0.75;
    }
    .tv-num-card__caps {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .tv-num-card__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      padding: 0.85rem 1.15rem 1rem;
      border-top: 1px solid var(--tv-border, rgba(15,23,42,0.06));
      background: rgba(15,23,42,0.015);
    }
    .tv-num-card__actions .btn { flex: 0 1 auto; }
    .tv-num-card__actions .btn-primary { flex: 1 1 auto; min-width: 8.5rem; }
    .tv-numeraciones-empty {
      text-align: center;
      padding: 3rem 2rem;
      border-radius: 12px;
      border: 1px dashed var(--tv-border, rgba(15,23,42,0.12));
    }
    .tv-numeraciones-empty__icon .material-symbols-outlined { font-size: 3rem; opacity: 0.45; }
    .tv-numeraciones-empty__title { margin: 1rem 0 0.5rem; font-size: 1.2rem; }
    .tv-numeraciones-empty__text { max-width: 36rem; margin: 0 auto 1.5rem; line-height: 1.55; opacity: 0.85; }
    .tv-numeraciones-empty__actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
    @media (max-width: 640px) {
      .tv-page-head--numeraciones.tv-page-head--row {
        flex-direction: column;
        align-items: stretch;
        gap: 0.65rem;
      }
      .tv-page-head--numeraciones .tv-page-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        width: 100%;
      }
      .tv-page-head--numeraciones .tv-page-actions .btn {
        min-width: 0;
        justify-content: center;
        font-size: 0.8125rem;
      }
      .tv-num-cards { grid-template-columns: 1fr; }
      .tv-num-card__number { font-size: 1.2rem; }
      .tv-num-card__actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tv-num-card__actions .btn-primary { grid-column: 1 / -1; }
      .tv-numeraciones-empty__actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        max-width: 22rem;
        margin: 0 auto;
      }
    }

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
