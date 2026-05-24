import { escapeHtml } from "../utils/html.js";

/** Marca visual alineada con telvoice.cl (landing). */
export const TV_BRAND = {
  name: "telvoice",
  isotipo: "/assets/telvoice-isotipo.png",
} as const;

export function brandPageTitle(pageTitle: string): string {
  return `${pageTitle} | ${TV_BRAND.name}`;
}

export function renderBrandIsotipo(size = 32): string {
  return `<img src="${TV_BRAND.isotipo}" alt="" width="${size}" height="${size}" class="tv-brand-isotipo" decoding="async" aria-hidden="true" />`;
}

export function renderFaviconLink(): string {
  return `<link rel="icon" href="${TV_BRAND.isotipo}" type="image/png" sizes="any" />`;
}

export function renderSidebarBrand(
  href: string,
  options?: { subtitle?: string; badge?: string },
): string {
  const subtitle = options?.subtitle
    ? `<span class="tv-brand-lockup__sub">${escapeHtml(options.subtitle)}</span>`
    : "";
  const badge = options?.badge
    ? `<span class="tv-sidebar__badge">${escapeHtml(options.badge)}</span>`
    : "";

  return `<a href="${href}" class="tv-brand-lockup">
    ${renderBrandIsotipo(32)}
    <span class="tv-brand-lockup__text">
      <span class="tv-brand-wordmark">${TV_BRAND.name}</span>
      ${subtitle}
    </span>
  </a>${badge}`;
}

export function renderAuthBrand(title: string, subtitle: string): string {
  return `<div class="tv-auth-brand">
    ${renderBrandIsotipo(48)}
    <div>
      <h1 class="tv-auth-title"><span class="tv-brand-wordmark">${escapeHtml(title)}</span></h1>
      <p class="tv-auth-sub">${escapeHtml(subtitle)}</p>
    </div>
  </div>`;
}
