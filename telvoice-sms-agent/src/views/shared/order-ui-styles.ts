/** Estilos compartidos para timeline y detalle de órdenes (/app y /admin). */
export function getOrderUiSharedStyles(): string {
  return `
    .tv-filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin: 0 0 1rem;
    }
    .tv-filter-tab {
      padding: 0.35rem 0.85rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 500;
      text-decoration: none;
      color: var(--tv-muted);
      border: 1px solid var(--tv-border);
      background: var(--tv-surface);
    }
    .tv-filter-tab:hover {
      color: var(--tv-primary);
      border-color: var(--tv-primary);
      text-decoration: none;
    }
    .tv-filter-tab--active {
      background: var(--tv-primary);
      color: #fff;
      border-color: var(--tv-primary);
    }
    .tv-timeline {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .tv-timeline__item {
      display: flex;
      gap: 0.75rem;
      padding: 0.65rem 0;
      border-left: 2px solid var(--tv-border);
      margin-left: 0.65rem;
      padding-left: 1rem;
      position: relative;
    }
    .tv-timeline__item--done { border-left-color: #10b981; }
    .tv-timeline__item--current { border-left-color: #f59e0b; }
    .tv-timeline__icon {
      font-size: 1.25rem;
      color: var(--tv-primary);
      margin-left: -1.65rem;
      background: var(--tv-surface);
    }
    .tv-timeline__item--done .tv-timeline__icon { color: #10b981; }
    .tv-timeline__item--current .tv-timeline__icon { color: #d97706; }
    .tv-detail-dl {
      display: grid;
      gap: 0.65rem;
      margin: 0;
    }
    .tv-detail-dl > div {
      display: grid;
      grid-template-columns: minmax(120px, 38%) 1fr;
      gap: 0.5rem;
      align-items: baseline;
    }
    .tv-detail-dl dt {
      margin: 0;
      font-size: 0.8rem;
      color: var(--tv-muted);
      font-weight: 600;
    }
    .tv-detail-dl dd { margin: 0; }
    .tv-order-id {
      font-size: 0.85rem;
      padding: 0.15rem 0.4rem;
      background: #f1f5f9;
      border-radius: 4px;
    }
    .tv-badge-qa {
      font-size: 0.7rem;
      vertical-align: middle;
      margin-left: 0.25rem;
    }
    .tv-table-actions {
      white-space: nowrap;
    }
    .tv-table-actions .btn { margin: 0.1rem 0.15rem; }
  `;
}
