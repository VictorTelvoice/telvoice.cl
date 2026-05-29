import { toolListRecentMessages } from "../clientAgentTools.js";
import { assertCompanyTool } from "./getClientBalanceTool.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

export const getRecentMessagesTool = {
  name: "get_recent_messages",
  description: "Últimos SMS enviados de la empresa.",
  requiresCompany: true,
  async run(
    ctx: AgentToolContext,
    input: { limit?: number },
  ): Promise<AgentToolResult> {
    const companyId = assertCompanyTool(ctx);
    const summary = await toolListRecentMessages(companyId, input.limit ?? 5);
    return { ok: true, summary };
  },
};
