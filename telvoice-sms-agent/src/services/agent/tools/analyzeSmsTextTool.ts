import { calculateSmsSegments, isGsm7 } from "../../smsSegmentService.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

export type SmsTextAnalysis = {
  characters: number;
  encoding: "GSM-7" | "UCS-2";
  segments: number;
  costSms: number;
  warnings: string[];
  suggestions: string[];
};

export function analyzeSmsText(text: string): SmsTextAnalysis {
  const seg = calculateSmsSegments(text);
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!isGsm7(text)) {
    warnings.push("El texto usa caracteres fuera de GSM-7 (posible UCS-2).");
    suggestions.push("Evita emojis y símbolos especiales para ahorrar segmentos.");
  }
  if (seg.segments > 1) {
    warnings.push(`Consume ${seg.segments} segmentos por destinatario.`);
    suggestions.push(
      `Intenta reducir de ${seg.characters} a ≤160 caracteres GSM para 1 segmento.`,
    );
  }
  if (text.length > 140) {
    suggestions.push("Usa un CTA directo y elimina frases de relleno.");
  }

  return {
    characters: seg.characters,
    encoding: seg.encoding,
    segments: seg.segments,
    costSms: seg.costSms,
    warnings,
    suggestions,
  };
}

export const analyzeSmsTextTool = {
  name: "analyze_sms_text",
  description: "Analiza longitud, encoding y segmentos de un SMS.",
  requiresCompany: false,
  async run(
    _ctx: AgentToolContext,
    input: { text: string },
  ): Promise<AgentToolResult<SmsTextAnalysis>> {
    const text = String(input.text ?? "").trim();
    if (!text) {
      return { ok: false, summary: "Texto vacío.", error: "empty" };
    }
    const data = analyzeSmsText(text);
    const lines = [
      `Caracteres: ${data.characters}`,
      `Encoding: ${data.encoding}`,
      `Segmentos: ${data.segments}`,
      `Costo por destinatario: ${data.costSms} SMS`,
    ];
    if (data.warnings.length) {
      lines.push("", "Advertencias:", ...data.warnings.map((w) => `• ${w}`));
    }
    if (data.suggestions.length) {
      lines.push("", "Sugerencias:", ...data.suggestions.map((s) => `• ${s}`));
    }
    return { ok: true, summary: lines.join("\n"), data };
  },
};
