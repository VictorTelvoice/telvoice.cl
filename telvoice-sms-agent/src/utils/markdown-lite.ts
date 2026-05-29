import { escapeHtml } from "./html.js";

/** Conversión mínima Markdown → HTML para manuales internos (sin HTML crudo en el MD). */
export function markdownLiteToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let inTable = false;
  let tableRows: string[] = [];

  const flushTable = (): void => {
    if (!tableRows.length) return;
    const rows = tableRows.filter((r) => !/^\|[\s\-:|]+\|$/.test(r.trim()));
    if (!rows.length) {
      tableRows = [];
      inTable = false;
      return;
    }
    const parseRow = (row: string): string[] =>
      row
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());

    const head = parseRow(rows[0]!);
    const body = rows.slice(1).map(parseRow);
    out.push('<div class="table-wrap"><table class="tv-table tv-table--dash">');
    out.push(`<thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join("")}</tr></thead>`);
    out.push("<tbody>");
    for (const row of body) {
      out.push(`<tr>${row.map((c) => `<td>${inlineMd(c)}</td>`).join("")}</tr>`);
    }
    out.push("</tbody></table></div>");
    tableRows = [];
    inTable = false;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        flushTable();
        out.push('<pre class="tv-code-block"><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (line.trim().startsWith("|")) {
      inTable = true;
      tableRows.push(line);
      continue;
    }
    if (inTable) {
      flushTable();
    }

    const trimmed = line.trim();
    if (!trimmed) {
      out.push("");
      continue;
    }
    if (trimmed === "---") {
      out.push("<hr />");
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(`<h1>${inlineMd(line.slice(2).trim())}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(`<h2>${inlineMd(line.slice(3).trim())}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(`<h3>${inlineMd(line.slice(4).trim())}</h3>`);
      continue;
    }
    if (/^-\s+/.test(trimmed)) {
      out.push(`<ul><li>${inlineMd(trimmed.replace(/^-\s+/, ""))}</li></ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      out.push(
        `<ol start="${trimmed.match(/^(\d+)/)?.[1] ?? "1"}"><li>${inlineMd(trimmed.replace(/^\d+\.\s+/, ""))}</li></ol>`,
      );
      continue;
    }
    if (trimmed.startsWith("> ")) {
      out.push(`<blockquote><p>${inlineMd(trimmed.slice(2))}</p></blockquote>`);
      continue;
    }
    out.push(`<p>${inlineMd(trimmed)}</p>`);
  }

  if (inTable) flushTable();
  if (inCode) out.push("</code></pre>");

  return out.join("\n");
}

function inlineMd(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}
