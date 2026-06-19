/** Estilos del panel cliente — /app/planes-agente */

export function getAppSimPlansStyles(): string {
  return `
    .tv-sim-plans-page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .tv-sim-plans-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1.25rem;
      align-items: stretch;
    }

    @media (max-width: 1100px) {
      .tv-sim-plans-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 680px) {
      .tv-sim-plans-grid {
        grid-template-columns: 1fr;
      }
    }

    .tv-sim-plan-card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-height: 100%;
      padding: 1.5rem;
      border-radius: 24px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      background: var(--tv-light-surface, #fff);
      box-shadow: 0 4px 24px -12px rgba(15, 23, 42, 0.12);
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }

    .tv-sim-plan-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 36px -16px rgba(15, 23, 42, 0.18);
    }

    .tv-sim-plan-card--featured {
      border-color: rgba(0, 82, 204, 0.28);
      box-shadow:
        0 4px 24px -12px rgba(15, 23, 42, 0.12),
        0 0 0 1px rgba(0, 82, 204, 0.08),
        0 18px 40px -24px rgba(0, 82, 204, 0.22);
    }

    .tv-sim-plan-card--featured:hover {
      box-shadow:
        0 14px 36px -16px rgba(15, 23, 42, 0.18),
        0 0 0 1px rgba(0, 82, 204, 0.12),
        0 22px 48px -24px rgba(0, 82, 204, 0.26);
    }

    .tv-sim-plan-card--selected {
      border-color: rgba(0, 82, 204, 0.42);
      box-shadow:
        0 0 0 1px rgba(0, 82, 204, 0.14),
        0 12px 32px -18px rgba(0, 82, 204, 0.2);
    }

    .tv-sim-plan-card--custom {
      background: linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(255, 255, 255, 1) 100%);
    }

    .tv-sim-plan-card__badge-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      min-height: 1.75rem;
      margin-bottom: 1rem;
    }

    .tv-sim-plan-card__badge {
      display: inline-flex;
      align-items: center;
      padding: 0.28rem 0.65rem;
      border-radius: 999px;
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--tv-light-muted, #64748b);
      background: rgba(148, 163, 184, 0.14);
      border: 1px solid rgba(148, 163, 184, 0.18);
      line-height: 1.2;
    }

    .tv-sim-plan-card__badge--popular {
      color: #1d4ed8;
      background: rgba(0, 82, 204, 0.1);
      border-color: rgba(0, 82, 204, 0.18);
    }

    .tv-sim-plan-card__badge--selected {
      margin-left: auto;
      color: #0369a1;
      background: rgba(14, 165, 233, 0.12);
      border-color: rgba(14, 165, 233, 0.22);
    }

    .tv-sim-plan-card__badge--custom {
      color: #475569;
      background: rgba(100, 116, 139, 0.12);
      border-color: rgba(100, 116, 139, 0.2);
    }

    .tv-sim-plan-card__title {
      margin: 0 0 0.35rem;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--tv-light-text, #0f172a);
      line-height: 1.15;
    }

    .tv-sim-plan-card__price {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--tv-light-text, #0f172a);
      line-height: 1.1;
    }

    .tv-sim-plan-card__price span {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--tv-light-muted, #64748b);
      letter-spacing: 0;
    }

    .tv-sim-plan-card__price--custom {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .tv-sim-plan-card__price-note {
      margin: 0.35rem 0 0;
      font-size: 0.8125rem;
      color: var(--tv-light-muted, #64748b);
      line-height: 1.4;
    }

    .tv-sim-plan-card__description {
      margin: 1rem 0 0;
      font-size: 0.9375rem;
      line-height: 1.55;
      color: var(--tv-light-muted, #64748b);
    }

    .tv-sim-plan-card__features {
      flex: 1;
      list-style: none;
      margin: 1.15rem 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }

    .tv-sim-plan-card__features li {
      display: flex;
      align-items: flex-start;
      gap: 0.55rem;
      font-size: 0.9rem;
      line-height: 1.45;
      color: var(--tv-light-text, #0f172a);
    }

    .tv-sim-plan-card__features .material-symbols-outlined {
      flex-shrink: 0;
      font-size: 1.05rem;
      color: #059669;
      margin-top: 0.05rem;
    }

    .tv-sim-plan-card__pending {
      margin: 0.85rem 0 0;
      padding: 0.65rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: #0369a1;
      background: rgba(14, 165, 233, 0.08);
      border: 1px solid rgba(14, 165, 233, 0.14);
    }

    .tv-sim-plan-card__cta {
      margin-top: auto;
      padding-top: 1.25rem;
    }

    .tv-sim-plan-card__cta .btn {
      width: 100%;
      justify-content: center;
      min-height: 44px;
      border-radius: 14px;
      font-weight: 600;
      gap: 0.45rem;
    }

    .tv-sim-plans-note {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin-top: 0.25rem;
      padding: 1rem 1.15rem;
      border-radius: 16px;
      border: 1px solid rgba(0, 82, 204, 0.14);
      background: rgba(0, 82, 204, 0.05);
      color: var(--tv-light-muted, #64748b);
      font-size: 0.875rem;
      line-height: 1.55;
      max-width: 56rem;
    }

    .tv-sim-plans-note .material-symbols-outlined {
      flex-shrink: 0;
      font-size: 1.25rem;
      color: var(--tv-light-primary, #0052cc);
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
