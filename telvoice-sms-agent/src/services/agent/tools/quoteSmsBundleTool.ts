import { createQuickQuote } from "../../commercialQuoteService.js";
import { extractCommercialQuantity } from "../agentCommercialText.js";
import type { CommercialQuoteResult } from "../../../types/commercial.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

export const quoteSmsBundleTool = {
  name: "quote_sms_bundle",
  description: "Cotiza bolsas SMS Chile con tramos Telvoice.cl (múltiplos de 1.000, IVA 19%).",
  requiresCompany: false,
  async run(
    _ctx: AgentToolContext,
    input: { quantity?: number; text?: string },
  ): Promise<AgentToolResult<CommercialQuoteResult>> {
    let qty = input.quantity;
    if (!qty && input.text) {
      qty = extractCommercialQuantity(input.text) ?? undefined;
    }
    if (!qty || qty < 1) {
      return {
        ok: false,
        summary: "Indica cantidad de SMS (ej. 30000).",
        error: "quantity_required",
      };
    }
    const quote = await createQuickQuote(qty);
    return {
      ok: true,
      summary: quote.commercial_message,
      data: quote,
    };
  },
};
