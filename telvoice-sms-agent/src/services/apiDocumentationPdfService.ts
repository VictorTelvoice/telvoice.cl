import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import {
  type ApiDocContentOptions,
  docSnippetAuthHeader,
  docSnippetBalance,
  docSnippetMessageDetail,
  docSnippetMessageList,
  docSnippetSend,
  getApiDocAuthNotes,
  getApiDocCurrentStateBullets,
  getApiDocErrorRows,
  getApiDocIdempotencyBullets,
  getApiDocLegalNote,
  getApiDocRateLimits,
  getApiDocRecommendedFlow,
  getApiDocScopeRows,
  getApiDocSendEndpointLabel,
  getApiDocStatusItems,
  getApiDocSubtitle,
  getApiDocSummary,
  API_DOC_TITLE,
} from "../views/app-ui/api-documentation-content.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ISOTIPO_PATH = path.join(PROJECT_ROOT, "public/assets/telvoice-isotipo.png");

function ensureSpace(doc: PdfDoc, minHeight = 60): void {
  if (doc.y > doc.page.height - minHeight) {
    doc.addPage();
  }
}

function addHeading(doc: PdfDoc, text: string, size = 14): void {
  ensureSpace(doc, 80);
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(size).text(text, { continued: false });
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(10);
}

function addParagraph(doc: PdfDoc, text: string): void {
  ensureSpace(doc, 50);
  doc.font("Helvetica").fontSize(10).text(text, { lineGap: 2 });
  doc.moveDown(0.2);
}

function addMonoBlock(doc: PdfDoc, text: string): void {
  ensureSpace(doc, 100);
  doc.font("Courier").fontSize(7.5).text(text, { lineGap: 2 });
  doc.font("Helvetica").fontSize(10);
  doc.moveDown(0.35);
}

function renderBrandedHeader(doc: PdfDoc, subtitle: string): void {
  const margin = 50;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - margin * 2;
  const logoSize = 40;
  let y = margin;

  if (fs.existsSync(ISOTIPO_PATH)) {
    doc.image(ISOTIPO_PATH, (pageWidth - logoSize) / 2, y, {
      width: logoSize,
      height: logoSize,
    });
    y += logoSize + 18;
  }

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#111111");
  doc.text(API_DOC_TITLE, margin, y, { width: contentWidth, align: "center" });
  y = doc.y + 10;

  doc.font("Helvetica").fontSize(12).fillColor("#444444");
  doc.text(subtitle, margin, y, { width: contentWidth, align: "center" });
  doc.fillColor("#000000");

  doc.y = doc.y + 24;
  doc.x = margin;
}

export function generateApiDocumentationPdf(
  docOptions: ApiDocContentOptions = { mode: "sandbox", keyMaskedHint: null },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderBrandedHeader(doc, getApiDocSubtitle(docOptions));
    doc.moveDown(0.5);

    addHeading(doc, "Resumen");
    addParagraph(doc, getApiDocSummary(docOptions));

    addHeading(doc, "Estado de la API");
    for (const item of getApiDocStatusItems(docOptions)) {
      addParagraph(doc, `${item.label}: ${item.value}`);
    }

    addHeading(doc, "Autenticación");
    for (const note of getApiDocAuthNotes(docOptions)) {
      addParagraph(doc, note);
    }
    addMonoBlock(doc, docSnippetAuthHeader(docOptions));

    addHeading(doc, "Endpoints");
    addParagraph(doc, "GET /api/v1/balance — Consultar saldo (scope balance:read)");
    addMonoBlock(doc, docSnippetBalance(docOptions));
    addParagraph(doc, getApiDocSendEndpointLabel(docOptions));
    addMonoBlock(doc, docSnippetSend(docOptions));
    addParagraph(doc, "GET /api/v1/messages/:id — Consultar mensaje (scope messages:read)");
    addMonoBlock(doc, docSnippetMessageDetail(docOptions));
    addParagraph(doc, "GET /api/v1/messages — Listar mensajes (scope messages:read)");
    addMonoBlock(doc, docSnippetMessageList(docOptions));

    addHeading(doc, "Scopes");
    for (const row of getApiDocScopeRows(docOptions)) {
      addParagraph(doc, `${row.scope} — ${row.use}`);
    }

    addHeading(doc, "Errores comunes");
    for (const row of getApiDocErrorRows(docOptions)) {
      addParagraph(doc, `${row.http} ${row.code} — ${row.description}`);
    }

    addHeading(doc, "Rate limits");
    for (const block of getApiDocRateLimits(docOptions)) {
      ensureSpace(doc, 70);
      doc.font("Helvetica-Bold").text(block.title);
      doc.font("Helvetica");
      for (const item of block.items) {
        addParagraph(doc, `• ${item}`);
      }
      doc.moveDown(0.1);
    }

    addHeading(doc, "Idempotency-Key");
    for (const bullet of getApiDocIdempotencyBullets()) {
      addParagraph(doc, `• ${bullet}`);
    }

    addHeading(doc, "Flujo recomendado");
    getApiDocRecommendedFlow(docOptions).forEach((step, i) => {
      addParagraph(doc, `${i + 1}. ${step}`);
    });

    addHeading(doc, "Estado actual");
    for (const bullet of getApiDocCurrentStateBullets(docOptions)) {
      addParagraph(doc, `• ${bullet}`);
    }

    addHeading(doc, "Nota");
    doc.font("Helvetica-Oblique").fontSize(9).text(getApiDocLegalNote(docOptions), { lineGap: 2 });
    doc.font("Helvetica").fontSize(10);

    doc.end();
  });
}
