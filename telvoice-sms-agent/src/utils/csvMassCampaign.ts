export type MassCampaignCsvRow = {
  phone: string;
  message: string;
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
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPhoneHeader(cell: string): boolean {
  const h = normHeader(cell);
  return /^(numero|numeros|telefono|phone|destino|celular|movil|to|msisdn)s?$/.test(
    h,
  );
}

function isMessageHeader(cell: string): boolean {
  const h = normHeader(cell);
  return /^(mensaje|mensajes|message|texto|sms|contenido)s?$/.test(h);
}

function looksLikeHeaderRow(cols: string[]): boolean {
  if (cols.length < 2) return false;
  return isPhoneHeader(cols[0] ?? "") || isMessageHeader(cols[1] ?? "");
}

/** Parsea CSV con columnas número + mensaje (cabecera opcional). */
export function parseMassCampaignCsv(text: string): MassCampaignCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  let start = 0;
  const firstCols = parseCsvLine(lines[0]!);
  if (looksLikeHeaderRow(firstCols)) {
    start = 1;
  }

  const rows: MassCampaignCsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    if (!cols.length) continue;
    const phone = (cols[0] ?? "").trim();
    if (!phone) continue;
    const message =
      cols.length >= 2 ? cols.slice(1).join(",").trim() : "";
    rows.push({ phone, message });
  }
  return rows;
}

export function parseMassCampaignRowsJson(
  raw: string,
): MassCampaignCsvRow[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(data)) return null;
    const rows: MassCampaignCsvRow[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const phone = String((item as { phone?: string }).phone ?? "").trim();
      const message = String((item as { message?: string }).message ?? "").trim();
      if (phone) rows.push({ phone, message });
    }
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}
