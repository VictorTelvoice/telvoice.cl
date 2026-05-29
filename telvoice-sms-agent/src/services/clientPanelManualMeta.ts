export type ManualTocEntry = {
  id: string;
  title: string;
  level: 2 | 3;
};

export function slugifyManualHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function extractManualToc(markdown: string): ManualTocEntry[] {
  const entries: ManualTocEntry[] = [];
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("## ")) {
      const title = line.slice(3).trim();
      if (/tabla de contenidos/i.test(title)) continue;
      entries.push({ id: slugifyManualHeading(title), title, level: 2 });
      continue;
    }
    if (line.startsWith("### ")) {
      const title = line.slice(4).trim();
      entries.push({ id: slugifyManualHeading(title), title, level: 3 });
    }
  }
  return entries;
}

export function extractManualIntro(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let pastTitle = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      pastTitle = true;
      continue;
    }
    if (!pastTitle) continue;
    const t = line.trim();
    if (!t || t === "---") continue;
    if (t.startsWith("#")) break;
    if (t.startsWith("**Audiencia:**")) continue;
    if (t.startsWith("**Versión")) continue;
    return t.replace(/\*\*/g, "");
  }
  return "Guía operativa del panel cliente Telvoice.";
}
