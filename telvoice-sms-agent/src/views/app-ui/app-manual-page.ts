import { readClientPanelManualMarkdown } from "../../services/clientPanelManualService.js";
import { markdownLiteToHtml } from "../../utils/markdown-lite.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

function manualPageStyles(): string {
  return `<style>
    .tv-manual-page .tv-manual-body {
      max-width: 52rem;
      line-height: 1.55;
      font-size: 0.95rem;
    }
    .tv-manual-page .tv-manual-body h1 {
      font-size: 1.65rem;
      margin: 0 0 0.75rem;
    }
    .tv-manual-page .tv-manual-body h2 {
      font-size: 1.2rem;
      margin: 1.75rem 0 0.65rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--tv-border);
    }
    .tv-manual-page .tv-manual-body h3 {
      font-size: 1.05rem;
      margin: 1.25rem 0 0.5rem;
    }
    .tv-manual-page .tv-manual-body p,
    .tv-manual-page .tv-manual-body ul,
    .tv-manual-page .tv-manual-body ol {
      margin: 0 0 0.75rem;
    }
    .tv-manual-page .tv-manual-body blockquote {
      margin: 0 0 0.75rem;
      padding: 0.65rem 1rem;
      border-left: 3px solid var(--tv-primary);
      background: var(--tv-surface-2);
      border-radius: 0 var(--tv-radius) var(--tv-radius) 0;
    }
    .tv-manual-page .tv-manual-body hr {
      border: none;
      border-top: 1px solid var(--tv-border);
      margin: 1.5rem 0;
    }
    .tv-manual-page .tv-manual-body code {
      font-size: 0.85em;
    }
  </style>`;
}

export function renderAppManualPage(ctx: AppPageContext): string {
  const html = markdownLiteToHtml(readClientPanelManualMarkdown());
  const body = `
    ${manualPageStyles()}
    <div class="tv-manual-page tv-client-dashboard">
      ${renderPageHeader({
        title: "Manual de envío",
        subtitle:
          "Guía completa del panel cliente: contactos, plantillas, campañas masivas, programados y seguimiento DLR.",
        actions: [
          renderBtn("Descargar PDF", {
            href: "/app/manual.pdf",
            variant: "secondary",
            icon: "download",
          }),
          renderBtn("Enviar SMS", { href: "/app/send-sms", variant: "primary", icon: "send" }),
        ].join(" "),
      })}
      <section class="tv-panel">
        <div class="tv-panel__body tv-manual-body">${html}</div>
      </section>
    </div>`;

  return wrapAppPage(ctx, "manual", "Manual de envío", body);
}
