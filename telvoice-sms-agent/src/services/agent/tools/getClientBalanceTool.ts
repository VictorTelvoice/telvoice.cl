import { getCompanyBalance } from "../../smsWalletService.js";
import { AppError } from "../../../utils/errors.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

export const getClientBalanceTool = {
  name: "get_client_balance",
  description: "Saldo SMS interno de la empresa (panel).",
  requiresCompany: true,
  async run(ctx: AgentToolContext): Promise<AgentToolResult> {
    if (!ctx.companyId) {
      return { ok: false, summary: "Empresa no identificada.", error: "no_company" };
    }
    const b = await getCompanyBalance(ctx.companyId);
    return {
      ok: true,
      summary:
        `Saldo disponible: ${b.availableSms.toLocaleString("es-CL")} SMS. ` +
        `Reservado: ${b.reservedSms}. Consumido: ${b.consumedSms}.`,
      data: b,
    };
  },
};

export function assertCompanyTool(ctx: AgentToolContext): string {
  if (!ctx.companyId) {
    throw new AppError("Esta acción requiere una empresa autenticada.", 403);
  }
  return ctx.companyId;
}
