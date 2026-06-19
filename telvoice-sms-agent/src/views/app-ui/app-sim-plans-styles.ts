/** Estilos /app/planes-agente — lenguaje visual alineado con numeracion-sim.html */

export function getAppSimPlansStyles(): string {
  return `
    .tv-sim-plans-page {
      --tv-sim-primary: #0052cc;
      --tv-sim-muted: #5c6478;
      --tv-sim-border: rgba(195, 198, 214, 0.75);
      display: flex;
      flex-direction: column;
      gap: 1.75rem;
      padding-bottom: 0.5rem;
    }

    .tv-sim-plans-hero {
      text-align: center;
      max-width: 44rem;
      margin: 0 auto;
    }

    .tv-sim-plans-hero__eyebrow {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--tv-sim-primary);
      margin: 0 0 0.5rem;
    }

    .tv-sim-plans-grid {
      display: grid;
      gap: 1.25rem;
      align-items: stretch;
    }

    @media (min-width: 900px) {
      .tv-sim-plans-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    @media (max-width: 899px) and (min-width: 680px) {
      .tv-sim-plans-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 679px) {
      .tv-sim-plans-grid {
        grid-template-columns: 1fr;
      }
    }

    .tv-sim-plan-card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-height: 100%;
      padding: 1.75rem 1.5rem 1.5rem;
      border-radius: 1.35rem;
      border: 1px solid var(--tv-sim-border);
      background: #fff;
      box-shadow: 0 4px 24px -8px rgba(15, 23, 42, 0.08);
      transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
    }

    .tv-sim-plan-card:hover {
      transform: translateY(-4px);
      border-color: rgba(0, 82, 204, 0.35);
      box-shadow: 0 20px 48px -14px rgba(0, 82, 204, 0.16);
    }

    .tv-sim-plan-card--featured {
      border: 2px solid var(--tv-sim-primary);
      padding-top: 2rem;
    }

    .tv-sim-plan-card--custom {
      border-style: dashed;
      border-color: rgba(99, 102, 241, 0.35);
      background: linear-gradient(180deg, #faf8ff 0%, #fff 100%);
    }

    .tv-sim-plan-card__ribbon {
      position: absolute;
      top: -0.65rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      background: var(--tv-sim-primary);
      color: #fff;
      font-size: 0.6875rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .tv-sim-plan-card__billing-badge {
      align-self: flex-start;
      margin-bottom: 0.9rem;
      padding: 0.3rem 0.7rem;
      border-radius: 9999px;
      background: rgba(0, 82, 204, 0.08);
      color: var(--tv-sim-primary);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .tv-sim-plan-card__billing-badge--custom {
      color: #5b21b6;
      background: rgba(99, 102, 241, 0.1);
    }

    .tv-sim-plan-card__title {
      margin: 0;
      font-family: Montserrat, sans-serif;
      font-size: 1.25rem;
      font-weight: 800;
      color: #131b2e;
      line-height: 1.15;
    }

    .tv-sim-plan-card__price {
      margin: 0.5rem 0 0;
      font-family: Montserrat, sans-serif;
      font-size: clamp(1.7rem, 4vw, 2rem);
      font-weight: 800;
      color: var(--tv-sim-primary);
      line-height: 1.1;
    }

    .tv-sim-plan-card__price span {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--tv-sim-muted);
    }

    .tv-sim-plan-card__price--custom {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--tv-sim-muted);
    }

    .tv-sim-plan-card__price-note {
      min-height: 2.2rem;
      margin: 0.45rem 0 0;
      font-size: 0.78rem;
      line-height: 1.45;
      color: var(--tv-sim-muted);
    }

    .tv-sim-plan-card__description {
      margin: 0.75rem 0 0;
      font-size: 0.8125rem;
      line-height: 1.55;
      color: var(--tv-sim-muted);
    }

    .tv-sim-plan-card__features {
      flex: 1;
      list-style: none;
      margin: 1.25rem 0 0;
      padding: 0;
    }

    .tv-sim-plan-card__features li {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      font-size: 0.875rem;
      color: var(--tv-sim-muted);
      padding: 0.35rem 0;
      line-height: 1.45;
    }

    .tv-sim-plan-card__features .material-symbols-outlined {
      flex-shrink: 0;
      font-size: 1.125rem;
      color: var(--tv-sim-primary);
      margin-top: 0.05rem;
    }

    .tv-sim-plan-card__pending {
      margin: 0.85rem 0 0;
      padding: 0.75rem 0.85rem;
      border-radius: 0.85rem;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: #0369a1;
      background: rgba(0, 82, 204, 0.05);
      border: 1px solid rgba(0, 82, 204, 0.14);
    }

    .tv-sim-plan-card__cta {
      margin-top: 1.25rem;
    }

    .tv-sim-plan-card__cta-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      width: 100%;
      min-height: 2.9rem;
      padding: 0.9rem 1.25rem;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.9375rem;
      cursor: pointer;
      transition: background 0.2s, transform 0.2s, border-color 0.2s, box-shadow 0.2s;
      border: none;
      text-decoration: none;
    }

    .tv-sim-plan-card__cta-btn--primary {
      background: var(--tv-sim-primary);
      color: #fff;
      box-shadow: 0 8px 24px -8px rgba(0, 82, 204, 0.45);
    }

    .tv-sim-plan-card__cta-btn--primary:hover {
      background: #0040a2;
      transform: translateY(-1px);
    }

    .tv-sim-plan-card__cta-btn--secondary {
      background: transparent;
      color: var(--tv-sim-primary);
      border: 2px solid rgba(0, 82, 204, 0.25);
    }

    .tv-sim-plan-card__cta-btn--secondary:hover {
      border-color: rgba(0, 82, 204, 0.45);
      background: rgba(0, 82, 204, 0.05);
    }

    .tv-sim-plans-note {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin-top: 0.25rem;
      padding: 1rem 1.15rem;
      border-radius: 1rem;
      border: 1px solid rgba(0, 82, 204, 0.14);
      background: linear-gradient(180deg, rgba(248, 249, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%);
      color: var(--tv-sim-muted);
      font-size: 0.875rem;
      line-height: 1.55;
      max-width: 56rem;
      box-shadow: 0 12px 32px -24px rgba(0, 82, 204, 0.18);
    }

    .tv-sim-plans-note .material-symbols-outlined {
      flex-shrink: 0;
      font-size: 1.25rem;
      color: var(--tv-sim-primary);
      margin-top: 0.05rem;
    }

    .tv-sim-plans-note p {
      margin: 0;
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
  `;
}
