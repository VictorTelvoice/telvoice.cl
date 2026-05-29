import PDFDocument from "pdfkit";
import {
  API_DOC_LEGAL_NOTE,
  API_DOC_SUBTITLE,
  API_DOC_TITLE,
  docSnippetAuthHeader,
  docSnippetBalance,
  docSnippetMessageDetail,
  docSnippetMessageList,
  docSnippetSend,
  getApiDocCurrentStateBullets,
  getApiDocErrorRows,
  getApiDocIdempotencyBullets,
  getApiDocRateLimits,
  getApiDocRecommendedFlow,
  getApiDocScopeRows,
  getApiDocStatusItems,
} from "../views/app-ui/api-documentation-content.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

function addHeading(doc: PdfDoc, text: string, size = 14): void {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(size).text(text, { continued: false });
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(10);
}

function addMonoBlock(doc: PdfDoc, text: string): void {
  doc.font("Courier").fontSize(8).text(text, { lineGap: 2 });
  doc.font("Helvetica").fontSize(10);
  doc.moveDown(0.35);
}

export function generateApiDocumentationPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const generatedAt = new Date().toLocaleString("es-CL", {
      dateStyle: "long",
      timeStyle: "short",
    });

    doc.font("Helvetica-Bold").fontSize(20).text(API_DOC_TITLE);
    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(12).fillColor("#444444").text(API_DOC_SUBTITLE);
    doc.fillColor("#000000");
    doc.moveDown(0.35);
    doc.fontSize(9).text(`Generado: ${generatedAt}`);
    doc.text("Estado: sandbox activo — envío real no habilitado");
    doc.moveDown(0.75);

    addHeading(doc, "Resumen");
    doc.text(
      "API Telvoice para integración SMS. Autenticación Bearer con API Key sandbox (tlv_test_).",
    );

    addHeading(doc, "Estado de la API");
    for (const item of getApiDocStatusItems()) {
      doc.text(`${item.label}: ${item.value}`);
    }

    addHeading(doc, "Autenticación");
    addMonoBlock(doc, docSnippetAuthHeader());

    addHeading(doc, "Endpoints");
    doc.text("GET /api/v1/balance — Consultar saldo (scope balance:read)");
    addMonoBlock(doc, docSnippetBalance());
    doc.text("POST /api/v1/sms/send — Enviar SMS sandbox (scope sms:send)");
    addMonoBlock(doc, docSnippetSend());
    doc.text("GET /api/v1/messages/:id — Consultar mensaje (scope messages:read)");
    addMonoBlock(doc, docSnippetMessageDetail());
    doc.text("GET /api/v1/messages — Listar mensajes (scope messages:read)");
    addMonoBlock(doc, docSnippetMessageList());

    addHeading(doc, "Scopes");
    for (const row of getApiDocScopeRows()) {
      doc.text(`${row.scope} — ${row.use}`);
    }

    addHeading(doc, "Errores comunes");
    for (const row of getApiDocErrorRows()) {
      doc.text(`${row.http} ${row.code} — ${row.description}`);
    }

    addHeading(doc, "Rate limits");
    for (const block of getApiDocRateLimits()) {
      doc.font("Helvetica-Bold").text(block.title);
      doc.font("Helvetica");
      for (const item of block.items) {
        doc.text(`• ${item}`);
      }
      doc.moveDown(0.15);
    }

    addHeading(doc, "Idempotency-Key");
    for (const bullet of getApiDocIdempotencyBullets()) {
      doc.text(`• ${bullet}`);
    }

    addHeading(doc, "Flujo recomendado");
    getApiDocRecommendedFlow().forEach((step, i) => {
      doc.text(`${i + 1}. ${step}`);
    });

    addHeading(doc, "Estado actual");
    for (const bullet of getApiDocCurrentStateBullets()) {
      doc.text(`• ${bullet}`);
    }

    addHeading(doc, "Nota");
    doc.font("Helvetica-Oblique").text(API_DOC_LEGAL_NOTE);
    doc.font("Helvetica");

    doc.end();
  });
}
