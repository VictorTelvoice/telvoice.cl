import PDFDocument from "pdfkit";
import { readClientPanelManualMarkdown } from "./clientPanelManualService.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

function addHeading(doc: PdfDoc, text: string, size: number): void {
  if (doc.y > doc.page.height - 80) doc.addPage();
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(size).text(text, { continued: false });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10);
}

function addParagraph(doc: PdfDoc, text: string): void {
  if (doc.y > doc.page.height - 60) doc.addPage();
  doc.font("Helvetica").fontSize(10).text(text, { lineGap: 2 });
  doc.moveDown(0.15);
}

function addCodeBlock(doc: PdfDoc, lines: string[]): void {
  if (doc.y > doc.page.height - 100) doc.addPage();
  doc.moveDown(0.2);
  doc.font("Courier").fontSize(8);
  for (const line of lines) {
    if (doc.y > doc.page.height - 40) doc.addPage();
    doc.text(line, { lineGap: 1 });
  }
  doc.font("Helvetica").fontSize(10);
  doc.moveDown(0.25);
}

export function generateClientPanelManualPdf(): Promise<Buffer> {
  const markdown = readClientPanelManualMarkdown();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

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

    let inCode = false;
    const codeLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("```")) {
        if (inCode) {
          addCodeBlock(doc, codeLines);
          codeLines.length = 0;
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeLines.push(line);
        continue;
      }

      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === "---") continue;
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;

      if (line.startsWith("# ")) {
        doc.font("Helvetica-Bold").fontSize(18).text(line.slice(2).trim());
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(9).text(`Generado: ${generatedAt}`);
        doc.font("Helvetica").fontSize(10);
        doc.moveDown(0.5);
        continue;
      }
      if (line.startsWith("## ")) {
        addHeading(doc, line.slice(3).trim(), 13);
        continue;
      }
      if (line.startsWith("### ")) {
        addHeading(doc, line.slice(4).trim(), 11);
        continue;
      }
      if (trimmed.startsWith("|")) {
        const cells = trimmed
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim())
          .join(" · ");
        addParagraph(doc, cells);
        continue;
      }
      if (/^-\s+/.test(trimmed)) {
        addParagraph(doc, `• ${trimmed.replace(/^-\s+/, "").replace(/\*\*/g, "")}`);
        continue;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        addParagraph(doc, trimmed.replace(/\*\*/g, ""));
        continue;
      }
      if (trimmed.startsWith("> ")) {
        doc.font("Helvetica-Oblique").fontSize(9);
        addParagraph(doc, trimmed.slice(2).replace(/\*\*/g, ""));
        doc.font("Helvetica").fontSize(10);
        continue;
      }

      addParagraph(doc, trimmed.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
    }

    doc.end();
  });
}
