import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseCredentials, env } from "../config/env.js";
import { createSupabaseClient } from "./supabase-factory.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    assertSupabaseCredentials();
    client = createSupabaseClient(
      env.supabase.url,
      env.supabase.serviceRoleKey,
    );
  }
  return client;
}

export function resetSupabaseClientForTests(): void {
  client = null;
}
