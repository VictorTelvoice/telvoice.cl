import { validateRecipientNumber } from "../smsSegmentService.js";

export const AGENT_CSV_MAX_BYTES = 5 * 1024 * 1024;
export const AGENT_CSV_MAX_ROWS = 5000;

const PHONE_HEADER_RE =
  /^(telefono|teléfono|phone|mobile|numero|número|destinatario|recipient|celular|movil|móvil|to|msisdn)s?$/i;

export type AgentCsvParseResult = {
  totalRows: number;
  validRecipients: string[];
  invalidCount: number;
  duplicateCount: number;
  previewValid: string[];
  mainErrors: string[];
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if ((ch === "," || ch === ";") && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectPhoneColumnIndex(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = normHeader(headers[i] ?? "");
    if (PHONE_HEADER_RE.test(h)) {
      return i;
    }
  }
  return 0;
}

function rowLooksLikeHeader(cols: string[]): boolean {
  if (cols.length < 1) return false;
  const first = normHeader(cols[0] ?? "");
  if (PHONE_HEADER_RE.test(first)) return true;
  return cols.some((c) => PHONE_HEADER_RE.test(normHeader(c)));
}

export function parseAgentRecipientCsv(text: string): AgentCsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const mainErrors: string[] = [];
  if (!lines.length) {
    return {
      totalRows: 0,
      validRecipients: [],
      invalidCount: 0,
      duplicateCount: 0,
      previewValid: [],
      mainErrors: ["La planilla está vacía."],
    };
  }

  if (lines.length > AGENT_CSV_MAX_ROWS) {
    mainErrors.push(`Máximo ${AGENT_CSV_MAX_ROWS.toLocaleString("es-CL")} filas por archivo.`);
    lines.length = AGENT_CSV_MAX_ROWS;
  }

  let start = 0;
  let phoneCol = 0;
  const firstCols = parseCsvLine(lines[0]!);
  if (rowLooksLikeHeader(firstCols)) {
    phoneCol = detectPhoneColumnIndex(firstCols);
    start = 1;
  }

  const seen = new Set<string>();
  const validRecipients: string[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;
  let totalRows = 0;

  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const raw = (cols[phoneCol] ?? cols[0] ?? "").trim();
    if (!raw) {
      continue;
    }
    totalRows += 1;
    const validated = validateRecipientNumber(raw);
    if (!validated.ok || !validated.normalized) {
      invalidCount += 1;
      continue;
    }
    const key = validated.normalized.replace(/\D/g, "");
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    validRecipients.push(key.startsWith("56") ? key : validated.normalized.replace(/\D/g, ""));
  }

  if (!validRecipients.length && totalRows > 0) {
    mainErrors.push(
      "No encontré números válidos. Usa columna telefono, phone, numero o destinatario con formato 569XXXXXXXX.",
    );
  }

  return {
    totalRows,
    validRecipients,
    invalidCount,
    duplicateCount,
    previewValid: validRecipients.slice(0, 5).map((p) =>
      p.replace(/^\+/, "").replace(/^56/, "56"),
    ),
    mainErrors,
  };
}

export function displayPhoneChile(normalized: string): string {
  const d = normalized.replace(/\D/g, "");
  if (d.startsWith("56")) {
    return d;
  }
  return d;
}
