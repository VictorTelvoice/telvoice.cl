import { readClientPanelManualMarkdown } from "../../services/clientPanelManualService.js";
import {
  extractManualIntro,
  extractManualToc,
  type ManualTocEntry,
} from "../../services/clientPanelManualMeta.js";
import { escapeHtml } from "../../utils/html.js";
import { markdownLiteToHtml } from "../../utils/markdown-lite.js";
import { renderBtn } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

function renderTocNav(entries: ManualTocEntry[]): string {
  const main = entries.filter((e) => e.level === 2);
  return main
    .map(
      (e) =>
        `<a class="tv-manual-toc__link" href="#${escapeHtml(e.id)}">${escapeHtml(e.title)}</a>`,
    )
    .join("");
}

function manualPageStyles(): string {
  return `<style>
    .tv-manual-page {
      --tv-manual-accent: #0d9488;
      --tv-manual-accent-soft: rgba(13, 148, 136, 0.08);
      --tv-manual-hero-bg: linear-gradient(135deg, #0f766e 0%, #115e59 48%, #134e4a 100%);
    }
    .tv-manual-crumb {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.82rem;
      color: var(--tv-muted);
      margin-bottom: 1rem;
    }
    .tv-manual-crumb a {
      color: var(--tv-primary);
      text-decoration: none;
      font-weight: 500;
    }
    .tv-manual-crumb a:hover { text-decoration: underline; }
    .tv-manual-hero {
      border-radius: calc(var(--tv-radius) + 4px);
      background: var(--tv-manual-hero-bg);
      color: #ecfdf5;
      padding: 1.75rem 1.5rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 12px 40px rgba(15, 118, 110, 0.22);
      position: relative;
      overflow: hidden;
    }
    .tv-manual-hero::after {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 85% 15%, rgba(255,255,255,0.14), transparent 45%);
      pointer-events: none;
    }
    .tv-manual-hero__inner {
      position: relative;
      z-index: 1;
      display: grid;
      gap: 1rem;
    }
    @media (min-width: 768px) {
      .tv-manual-hero__inner {
        grid-template-columns: 1fr auto;
        align-items: center;
      }
    }
    .tv-manual-hero__icon {
      width: 3rem;
      height: 3rem;
      border-radius: 12px;
      background: rgba(255,255,255,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 0.65rem;
    }
    .tv-manual-hero__icon .material-symbols-outlined {
      font-size: 1.75rem;
      color: #fff;
    }
    .tv-manual-hero__title {
      margin: 0;
      font-size: clamp(1.35rem, 2.5vw, 1.75rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .tv-manual-hero__sub {
      margin: 0.5rem 0 0;
      max-width: 42rem;
      font-size: 0.92rem;
      line-height: 1.55;
      color: rgba(236, 253, 245, 0.88);
    }
    .tv-manual-hero__badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.85rem;
    }
    .tv-manual-hero__badge {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
      background: rgba(255,255,255,0.14);
      border: 1px solid rgba(255,255,255,0.22);
    }
    .tv-manual-hero__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-start;
    }
    .tv-manual-hero__actions .btn-secondary {
      background: rgba(255,255,255,0.95);
      border-color: transparent;
      color: #0f766e;
    }
    .tv-manual-hero__actions .btn-ghost {
      color: #ecfdf5;
      border: 1px solid rgba(255,255,255,0.35);
    }
    .tv-manual-layout {
      display: grid;
      gap: 1.25rem;
      align-items: start;
    }
    @media (min-width: 960px) {
      .tv-manual-layout {
        grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
      }
    }
    .tv-manual-toc-panel {
      position: sticky;
      top: 1rem;
    }
    .tv-manual-toc-panel .tv-panel__body {
      padding: 1rem 1.1rem;
    }
    .tv-manual-toc__label {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--tv-muted);
      margin: 0 0 0.65rem;
    }
    .tv-manual-toc__nav {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      max-height: min(62vh, 520px);
      overflow-y: auto;
      padding-right: 0.25rem;
    }
    .tv-manual-toc__link {
      display: block;
      padding: 0.4rem 0.55rem;
      border-radius: 8px;
      font-size: 0.82rem;
      line-height: 1.35;
      color: var(--tv-text);
      text-decoration: none;
      border-left: 2px solid transparent;
      transition: background 0.15s, border-color 0.15s;
    }
    .tv-manual-toc__link:hover {
      background: var(--tv-manual-accent-soft);
      border-left-color: var(--tv-manual-accent);
      color: var(--tv-manual-accent);
    }
    .tv-manual-toc__foot {
      margin-top: 1rem;
      padding-top: 0.85rem;
      border-top: 1px solid var(--tv-border);
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .tv-manual-article .tv-panel__body {
      padding: 1.35rem 1.5rem 2rem;
    }
    .tv-manual-article .tv-manual-h2 {
      scroll-margin-top: 1.25rem;
      font-size: 1.15rem;
      font-weight: 700;
      margin: 2rem 0 0.75rem;
      padding: 0.65rem 0 0.65rem 0.85rem;
      border-left: 3px solid var(--tv-manual-accent);
      background: var(--tv-manual-accent-soft);
      border-radius: 0 8px 8px 0;
    }
    .tv-manual-article .tv-manual-h2:first-child {
      margin-top: 0;
    }
    .tv-manual-article .tv-manual-h3 {
      scroll-margin-top: 1.25rem;
      font-size: 1rem;
      font-weight: 600;
      margin: 1.35rem 0 0.5rem;
      color: var(--tv-text);
    }
    .tv-manual-article .tv-manual-p {
      margin: 0 0 0.85rem;
      line-height: 1.65;
      color: var(--tv-text);
      font-size: 0.94rem;
    }
    .tv-manual-article .tv-manual-list {
      margin: 0 0 0.85rem 1.1rem;
      padding: 0;
      line-height: 1.6;
      font-size: 0.94rem;
    }
    .tv-manual-article .tv-manual-list li {
      margin-bottom: 0.35rem;
    }
    .tv-manual-article .tv-manual-callout {
      margin: 0 0 1rem;
      padding: 0.85rem 1rem;
      border-left: 3px solid var(--tv-manual-accent);
      background: var(--tv-manual-accent-soft);
      border-radius: 0 var(--tv-radius) var(--tv-radius) 0;
    }
    .tv-manual-article .tv-manual-callout p {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.55;
    }
    .tv-manual-article .tv-manual-inline-code {
      font-size: 0.85em;
      padding: 0.1em 0.35em;
      border-radius: 4px;
      background: var(--tv-surface-2);
      border: 1px solid var(--tv-border);
    }
    .tv-manual-article .tv-code-block {
      margin: 0 0 1rem;
      padding: 0.85rem 1rem;
      font-size: 0.8rem;
      line-height: 1.45;
      border-radius: var(--tv-radius);
      background: #0f172a;
      color: #e2e8f0;
      overflow-x: auto;
    }
    .tv-manual-article .table-wrap {
      margin: 0 0 1.25rem;
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      overflow: hidden;
    }
    .tv-manual-article .tv-table th {
      background: var(--tv-surface-2);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .tv-manual-article .tv-table td,
    .tv-manual-article .tv-table th {
      font-size: 0.88rem;
      vertical-align: top;
    }
    .tv-manual-article hr {
      border: none;
      border-top: 1px solid var(--tv-border);
      margin: 1.75rem 0;
    }
    .tv-manual-article .tv-manual-link {
      color: var(--tv-manual-accent);
      font-weight: 500;
    }
    .tv-manual-back-top {
      position: fixed;
      right: 1.25rem;
      bottom: 1.25rem;
      z-index: 40;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }
    .tv-manual-back-top.is-visible {
      opacity: 1;
      pointer-events: auto;
    }
  </style>`;
}

export function renderAppManualPage(ctx: AppPageContext): string {
  const md = readClientPanelManualMarkdown();
  const html = markdownLiteToHtml(md, { skipDocumentTitle: true });
  const toc = extractManualToc(md);
  const intro = extractManualIntro(md);

  const body = `
    ${manualPageStyles()}
    <div class="tv-manual-page tv-client-dashboard">
      <nav class="tv-manual-crumb" aria-label="Ruta">
        <a href="/app/support">Soporte</a>
        <span aria-hidden="true">/</span>
        <span>Manual de envío</span>
      </nav>

      <header class="tv-manual-hero">
        <div class="tv-manual-hero__inner">
          <div>
            <div class="tv-manual-hero__icon" aria-hidden="true">
              <span class="material-symbols-outlined">menu_book</span>
            </div>
            <h1 class="tv-manual-hero__title">Manual de envío SMS</h1>
            <p class="tv-manual-hero__sub">${escapeHtml(intro)}</p>
            <div class="tv-manual-hero__badges">
              <span class="tv-manual-hero__badge">Producción · LIVE SEND</span>
              <span class="tv-manual-hero__badge">Panel cliente</span>
              <span class="tv-manual-hero__badge">Mayo 2026</span>
            </div>
          </div>
          <div class="tv-manual-hero__actions">
            ${renderBtn("Descargar PDF", {
              href: "/app/support/manual.pdf",
              variant: "secondary",
              icon: "download",
            })}
            ${renderBtn("Enviar SMS", {
              href: "/app/send-sms",
              variant: "ghost",
              icon: "send",
            })}
          </div>
        </div>
      </header>

      <div class="tv-manual-layout">
        <aside class="tv-manual-toc-panel" aria-label="Índice del manual">
          <section class="tv-panel">
            <div class="tv-panel__body">
              <p class="tv-manual-toc__label">Contenido</p>
              <nav class="tv-manual-toc__nav">${renderTocNav(toc)}</nav>
              <div class="tv-manual-toc__foot">
                ${renderBtn("Volver a Soporte", {
                  href: "/app/support",
                  variant: "ghost",
                })}
              </div>
            </div>
          </section>
        </aside>

        <article class="tv-manual-article">
          <section class="tv-panel">
            <div class="tv-panel__body">${html}</div>
          </section>
        </article>
      </div>

      <button type="button" class="btn btn-secondary btn-sm tv-manual-back-top" id="tv-manual-back-top" aria-label="Volver arriba">
        <span class="material-symbols-outlined" style="font-size:1rem" aria-hidden="true">arrow_upward</span>
        Arriba
      </button>
    </div>
    <script>
    (function(){
      var btn = document.getElementById("tv-manual-back-top");
      if (!btn) return;
      window.addEventListener("scroll", function(){
        btn.classList.toggle("is-visible", window.scrollY > 480);
      }, { passive: true });
      btn.addEventListener("click", function(){ window.scrollTo({ top: 0, behavior: "smooth" }); });
    })();
    </script>`;

  return wrapAppPage(ctx, "support", "Manual de envío", body);
}
