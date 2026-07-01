import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production.");
  }
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-key"
);
