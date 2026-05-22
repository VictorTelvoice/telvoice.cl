import { getSupabase } from "../database/supabaseClient.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export interface WebAgentLeadRow {
  id: string;
  session_id: string | null;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  requested_quantity: number | null;
  message: string | null;
  use_case: string | null;
  source: string;
  status: string;
  created_at: string;
}

export interface WebAgentSessionRow {
  id: string;
  visitor_key: string;
  page_url: string | null;
  lead_capture_step: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface WebAgentQuoteRow {
  id: string;
  session_id: string | null;
  requested_quantity: number;
  quoted_quantity: number;
  unit_price: number;
  subtotal: number;
  iva: number;
  total_with_iva: number;
  tier_label: string;
  created_at: string;
}

export async function listWebAgentLeads(limit = 100): Promise<WebAgentLeadRow[]> {
  const { data, error } = await getSupabase()
    .from("web_agent_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    wrapSupabaseError(error, "listWebAgentLeads");
  }
  return (data ?? []) as WebAgentLeadRow[];
}

export async function listWebAgentSessions(
  limit = 80,
): Promise<WebAgentSessionRow[]> {
  const { data, error } = await getSupabase()
    .from("web_agent_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    wrapSupabaseError(error, "listWebAgentSessions");
  }

  const sessions = (data ?? []) as WebAgentSessionRow[];

  const withCounts = await Promise.all(
    sessions.map(async (s) => {
      const { count } = await getSupabase()
        .from("web_agent_messages")
        .select("*", { count: "exact", head: true })
        .eq("session_id", s.id);
      return { ...s, message_count: count ?? 0 };
    }),
  );

  return withCounts;
}

export async function listWebAgentQuotes(limit = 100): Promise<WebAgentQuoteRow[]> {
  const { data, error } = await getSupabase()
    .from("web_agent_quotes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    wrapSupabaseError(error, "listWebAgentQuotes");
  }
  return (data ?? []) as WebAgentQuoteRow[];
}
