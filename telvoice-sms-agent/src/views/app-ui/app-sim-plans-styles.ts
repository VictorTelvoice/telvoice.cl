/** Estilos /app/planes-agente — réplica scoped de numeracion-sim.html (#nsim-planes) */

export function getAppSimPlansStyles(): string {
  return `
    .tv-sim-plans-page {
      --nsim-primary: #0052cc;
      --nsim-text: #131b2e;
      --nsim-muted: #5c6478;
      --nsim-border: rgba(195, 198, 214, 0.75);
      color: var(--nsim-text);
    }

    .tv-sim-plans-page .nsim-section-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 1.25rem;
    }

    @media (min-width: 768px) {
      .tv-sim-plans-page .nsim-section-inner {
        padding: 0 2rem;
      }
    }

    .tv-sim-plans-page .nsim-section--lead {
      padding-top: 0.5rem;
      padding-bottom: 2.5rem;
    }

    @media (min-width: 768px) {
      .tv-sim-plans-page .nsim-section--lead {
        padding-top: 0.75rem;
        padding-bottom: 3rem;
      }
    }

    .tv-sim-plans-page .nsim-section-toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.75rem;
    }

    .tv-sim-plans-page .nsim-eyebrow {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nsim-primary);
      margin-bottom: 0.75rem;
    }

    .tv-sim-plans-page .nsim-eyebrow--center {
      display: block;
      text-align: center;
      margin-bottom: 0.5rem;
    }

    .tv-sim-plans-page .nsim-section-title {
      font-family: Montserrat, sans-serif;
      font-size: clamp(1.35rem, 3vw, 1.875rem);
      font-weight: 800;
      letter-spacing: -0.02em;
      text-align: center;
      margin: 0;
    }

    .tv-sim-plans-page .nsim-section-title--lead {
      font-size: clamp(1.75rem, 4vw, 2.65rem);
    }

    .tv-sim-plans-page .nsim-section-intro {
      text-align: center;
      max-width: 44rem;
      margin: 0.75rem auto 0;
      color: var(--nsim-muted);
      line-height: 1.65;
      font-size: 1.0625rem;
    }

    .tv-sim-plans-page .nsim-billing-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
      justify-content: space-between;
    }

    .tv-sim-plans-page .nsim-billing-card--switch-only {
      flex-direction: row;
      justify-content: center;
      align-items: center;
      max-width: 12.5rem;
      margin: 1.75rem auto 0;
      padding: 0.2rem;
      border: none;
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
    }

    .tv-sim-plans-page .nsim-billing-switch {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.2rem;
      padding: 0.2rem;
      border-radius: 9999px;
      background: #eef3ff;
      border: 1px solid rgba(0, 82, 204, 0.12);
      width: 100%;
    }

    .tv-sim-plans-page .nsim-billing-switch__button {
      border: none;
      border-radius: 9999px;
      background: transparent;
      color: var(--nsim-muted);
      padding: 0.45rem 0.55rem;
      font-size: 0.75rem;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.2s, color 0.2s, box-shadow 0.2s;
    }

    .tv-sim-plans-page .nsim-billing-switch__button span {
      margin-left: 0.25rem;
      color: #047857;
    }

    .tv-sim-plans-page .nsim-billing-switch__button.is-active {
      color: var(--nsim-primary);
      background: #fff;
      box-shadow: 0 8px 20px -14px rgba(0, 82, 204, 0.55);
    }

    .tv-sim-plans-page .nsim-billing-switch__button--panel-only {
      opacity: 0.55;
      cursor: default;
    }

    .tv-sim-plans-page .nsim-plans-grid {
      display: grid;
      gap: 1.25rem;
      margin-top: 2rem;
    }

    @media (min-width: 900px) {
      .tv-sim-plans-page .nsim-plans-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .tv-sim-plans-page .nsim-plan-card {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 1.75rem 1.5rem;
      border-radius: 1.35rem;
      border: 1px solid var(--nsim-border);
      background: #fff;
      box-shadow: 0 4px 24px -8px rgba(15, 23, 42, 0.08);
      transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s;
    }

    .tv-sim-plans-page .nsim-plan-card:hover {
      transform: translateY(-4px);
      border-color: rgba(0, 82, 204, 0.35);
      box-shadow: 0 20px 48px -14px rgba(0, 82, 204, 0.16);
    }

    .tv-sim-plans-page .nsim-plan-card.is-featured {
      border: 2px solid var(--nsim-primary);
    }

    .tv-sim-plans-page .nsim-plan-card--custom {
      border-style: dashed;
      border-color: rgba(99, 102, 241, 0.35);
      background: linear-gradient(180deg, #faf8ff 0%, #fff 100%);
    }

    .tv-sim-plans-page .nsim-plan-ribbon {
      position: absolute;
      top: -0.65rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      background: var(--nsim-primary);
      color: #fff;
      font-size: 0.6875rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .tv-sim-plans-page .nsim-plan-billing-badge {
      align-self: flex-start;
      margin-bottom: 0.9rem;
      padding: 0.3rem 0.7rem;
      border-radius: 9999px;
      background: rgba(0, 82, 204, 0.08);
      color: var(--nsim-primary);
      font-size: 0.72rem;
      font-weight: 800;
    }

    .tv-sim-plans-page .nsim-plan-billing-badge--custom {
      color: #5b21b6;
      background: rgba(99, 102, 241, 0.1);
    }

    .tv-sim-plans-page .nsim-plan-name {
      font-family: Montserrat, sans-serif;
      font-size: 1.25rem;
      font-weight: 800;
      margin: 0;
    }

    .tv-sim-plans-page .nsim-plan-price {
      font-family: Montserrat, sans-serif;
      font-size: clamp(1.7rem, 4vw, 2rem);
      font-weight: 800;
      color: var(--nsim-primary);
      margin: 0.5rem 0 0;
      line-height: 1.1;
    }

    .tv-sim-plans-page .nsim-plan-price span {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--nsim-muted);
    }

    .tv-sim-plans-page .nsim-plan-price--custom {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--nsim-muted);
    }

    .tv-sim-plans-page .nsim-plan-price-subnote {
      min-height: 2.2rem;
      margin: 0.45rem 0 0;
      font-size: 0.78rem;
      line-height: 1.45;
      color: var(--nsim-muted);
    }

    .tv-sim-plans-page .nsim-plan-desc {
      margin: 0.75rem 0 0;
      font-size: 0.8125rem;
      line-height: 1.55;
      color: var(--nsim-muted);
    }

    .tv-sim-plans-page .nsim-plan-features {
      margin: 1.25rem 0 0;
      padding: 0;
      list-style: none;
      flex: 1;
    }

    .tv-sim-plans-page .nsim-plan-features li {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      font-size: 0.875rem;
      color: var(--nsim-muted);
      padding: 0.35rem 0;
    }

    .tv-sim-plans-page .nsim-plan-features .material-symbols-outlined {
      font-size: 1.125rem;
      color: var(--nsim-primary);
      flex-shrink: 0;
    }

    .tv-sim-plans-page .nsim-btn-primary,
    .tv-sim-plans-page .nsim-btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.9rem;
      padding: 0.9rem 1.75rem;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.9375rem;
      cursor: pointer;
      transition: background 0.2s, transform 0.2s, border-color 0.2s, box-shadow 0.2s;
      text-decoration: none;
    }

    .tv-sim-plans-page .nsim-btn-primary {
      background: var(--nsim-primary);
      color: #fff;
      border: none;
      box-shadow: 0 8px 24px -8px rgba(0, 82, 204, 0.45);
    }

    .tv-sim-plans-page .nsim-btn-primary:hover {
      background: #0040a2;
      transform: translateY(-1px);
    }

    .tv-sim-plans-page .nsim-btn-secondary {
      background: transparent;
      color: var(--nsim-primary);
      border: 2px solid rgba(0, 82, 204, 0.25);
    }

    .tv-sim-plans-page .nsim-btn-secondary:hover {
      border-color: rgba(0, 82, 204, 0.45);
      background: rgba(0, 82, 204, 0.05);
    }

    .tv-sim-plans-page .nsim-plan-cta {
      margin-top: 1.25rem;
      width: 100%;
    }

    .tv-sim-plans-page .nsim-panel-preface {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      margin-bottom: 0.5rem;
    }

    .tv-agent-plan-status__meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.35rem 1rem;
      font-size: 0.9rem;
      margin-bottom: 0.75rem;
    }

    .tv-agent-plan-status__meta dt {
      opacity: 0.65;
    }

    .tv-agent-plan-status__message {
      margin: 0;
      line-height: 1.5;
    }

    .tv-agent-plan-numbers {
      margin: 0;
      padding-left: 1.25rem;
      line-height: 1.6;
    }

    @media (max-width: 899px) {
      .tv-sim-plans-page .nsim-plans-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .tv-sim-plans-page .nsim-plan-card {
        text-align: left;
      }

      .tv-sim-plans-page .nsim-billing-switch__button {
        padding-left: 0.45rem;
        padding-right: 0.45rem;
      }
    }
  `;
}
