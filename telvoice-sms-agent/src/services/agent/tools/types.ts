import type { AgentChannel } from "../types.js";

export type AgentToolContext = {
  channel: AgentChannel;
  companyId?: string | null;
  userId?: string | null;
  sessionId: string;
};

export type AgentToolResult<T = unknown> = {
  ok: boolean;
  summary: string;
  data?: T;
  error?: string;
};

export type AgentToolDef<TInput = Record<string, unknown>> = {
  name: string;
  description: string;
  requiresCompany: boolean;
  run: (ctx: AgentToolContext, input: TInput) => Promise<AgentToolResult>;
};
