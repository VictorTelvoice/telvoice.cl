const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function headers(prefer) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: prefer || "return=representation",
  };
}

export async function supabaseInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(row),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `Supabase insert ${table} HTTP ${res.status}`;
    throw new Error(msg);
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function supabaseUpdate(table, id, patch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(patch),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `Supabase update ${table} HTTP ${res.status}`;
    throw new Error(msg);
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function supabaseSelectOne(table, query) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${query}`,
    {
      method: "GET",
      headers: {
        ...headers("return=representation"),
        Accept: "application/json",
      },
    },
  );
  const data = await res.json().catch(() => []);
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `Supabase select ${table} HTTP ${res.status}`;
    throw new Error(msg);
  }
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}
