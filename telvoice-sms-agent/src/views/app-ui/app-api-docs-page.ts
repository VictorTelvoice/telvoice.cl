import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";
import {
  API_DOC_TITLE,
  getApiDocSubtitle,
  apiDocumentationStyles,
  renderApiDocumentationBody,
  type ApiDocContentOptions,
} from "./api-documentation-content.js";
import { escapeHtml } from "../../utils/html.js";

function renderDocsScript(): string {
  return `<script>
(function () {
  var toast = document.getElementById("tv-api-docs-toast");
  var docCopyLabels = {
    balance: "Ejemplo balance copiado.",
    send: "Ejemplo envío sandbox copiado.",
    message: "Ejemplo consultar mensaje copiado.",
    list: "Ejemplo listar mensajes copiado."
  };
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.setAttribute("aria-hidden", "false");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.setAttribute("aria-hidden", "true");
    }, 4200);
  }
  function copyText(text, okMsg) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(okMsg || "Copiado al portapapeles.");
      });
    }
  }
  document.querySelectorAll("[data-copy-doc]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.getAttribute("data-copy-doc");
      var tpl = document.getElementById("tv-api-doc-snippet-" + key);
      copyText(tpl ? tpl.textContent.trim() : "", docCopyLabels[key] || "Ejemplo copiado.");
    });
  });
})();
</script>
<div class="tv-api-toast" id="tv-api-docs-toast" role="status" aria-live="polite" aria-hidden="true"></div>`;
}

export function renderAppApiDocsPage(
  ctx: AppPageContext,
  pdfEnabled: boolean,
  docOptions: ApiDocContentOptions = { mode: "sandbox", keyMaskedHint: null },
): string {
  const pdfAction = pdfEnabled
    ? `<a href="/app/api/docs.pdf" class="btn btn-secondary" download="telvoice-api-docs.pdf">
         <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">download</span>
         Descargar PDF
       </a>`
    : `<button type="button" class="btn btn-secondary tv-api-docs-no-print" onclick="window.print()">
         <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">print</span>
         Imprimir / Guardar como PDF
       </button>`;

  const body = `
    ${apiDocumentationStyles()}
    <header class="tv-api-doc-hero">
      <img src="/assets/telvoice-isotipo.png" alt="" width="40" height="40" class="tv-api-doc-hero__logo" decoding="async" aria-hidden="true" />
      <h1 class="tv-api-doc-hero__title">${escapeHtml(API_DOC_TITLE)}</h1>
      <p class="tv-api-doc-hero__subtitle">${escapeHtml(getApiDocSubtitle(docOptions))}</p>
      <div class="tv-api-docs-actions tv-api-doc-hero__actions">
        ${pdfAction}
        <a href="/app/api" class="btn btn-ghost tv-api-docs-no-print">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">arrow_back</span>
          Volver a API
        </a>
      </div>
    </header>
    ${renderApiDocumentationBody({ interactive: true, doc: docOptions })}
    ${renderDocsScript()}`;

  return wrapAppPage(ctx, "api", "Documentación API", body);
}
