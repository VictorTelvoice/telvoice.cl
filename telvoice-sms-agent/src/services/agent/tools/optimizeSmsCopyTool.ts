import { analyzeSmsText } from "./analyzeSmsTextTool.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

function shortenCommercial(text: string): string {
  let t = text
    .replace(/\bestimado[s]?\s+cliente[s]?[,:]?\s*/gi, "")
    .replace(/\ble informamos que\b/gi, "")
    .replace(/\bdurante el d[ií]a de hoy\b/gi, "hoy")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > 120) {
    const cut = t.slice(0, 117).trim();
    t = `${cut}…`;
  }
  if (!/\b(visita|compra|reserva|click|ingresa)\b/i.test(t)) {
    t = `${t} Ver más en nuestra web.`;
  }
  return t;
}

export const optimizeSmsCopyTool = {
  name: "optimize_sms_copy",
  description: "Sugiere versiones más cortas y claras del mensaje SMS.",
  requiresCompany: false,
  async run(
    _ctx: AgentToolContext,
    input: { text: string; tone?: string },
  ): Promise<AgentToolResult> {
    const original = String(input.text ?? "").trim();
    if (!original) {
      return { ok: false, summary: "Pega el mensaje a optimizar.", error: "empty" };
    }
    const analysis = analyzeSmsText(original);
    const short = shortenCommercial(original);
    const shortAnalysis = analyzeSmsText(short);

    const lines = [
      `Original: ${analysis.characters} caracteres, ${analysis.segments} segmento(s).`,
      "",
      "Versión más corta sugerida:",
      `«${short}»`,
      `${shortAnalysis.characters} caracteres, ${shortAnalysis.segments} segmento(s).`,
    ];

    if (input.tone === "formal") {
      lines.push("", "Versión formal: mantén saludo breve y CTA explícito.");
    }

    return { ok: true, summary: lines.join("\n"), data: { original, short, analysis, shortAnalysis } };
  },
};
