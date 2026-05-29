import { toolListRecentCampaigns } from "../clientAgentTools.js";
import { assertCompanyTool } from "./getClientBalanceTool.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

export const getCampaignSummaryTool = {
  name: "get_campaign_summary",
  description: "Resumen de campañas recientes del cliente.",
  requiresCompany: true,
  async run(
    ctx: AgentToolContext,
    input: { limit?: number },
  ): Promise<AgentToolResult> {
    const companyId = assertCompanyTool(ctx);
    const summary = await toolListRecentCampaigns(companyId, input.limit ?? 5);
    return { ok: true, summary };
  },
};
