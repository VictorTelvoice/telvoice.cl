import { getSupabase } from "../database/supabaseClient.js";
import {
  WHOLESALE_CUSTOMER_CONNECTION_TYPES,
  WHOLESALE_PROVIDER_CONNECTION_TYPES,
  WHOLESALE_QUALITY_ESTIMATES,
  WHOLESALE_STATUSES,
  WHOLESALE_TRAFFIC_TYPES,
  type WholesaleCustomerConnectionType,
  type WholesaleCustomerRow,
  type WholesaleDashboardSnapshot,
  type WholesaleOpportunityRow,
  type WholesaleOpportunityWithCustomer,
  type WholesaleProviderConnectionType,
  type WholesaleProviderRow,
  type WholesaleQualityEstimate,
  type WholesaleRateOfferRow,
  type WholesaleRateOfferWithProvider,
  type WholesaleRouteRow,
  type WholesaleRouteTestEnriched,
  type WholesaleRouteTestRow,
  type WholesaleRouteWithProvider,
  type WholesaleStatus,
  type WholesaleTrafficType,
} from "../types/wholesale.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import type { PostgrestError } from "@supabase/supabase-js";

function dbError(error: PostgrestError | null, context: string): void {
  if (error) wrapSupabaseError(error, context);
}

function parseStatus(value: unknown, field = "status"): WholesaleStatus {
  const key = String(value ?? "draft").trim().toLowerCase();
  if (!(WHOLESALE_STATUSES as readonly string[]).includes(key)) {
    throw new ValidationError(`${field} inválido.`);
  }
  return key as WholesaleStatus;
}

function parseTrafficType(value: unknown): WholesaleTrafficType {
  const key = String(value ?? "promotional").trim().toLowerCase();
  if (!(WHOLESALE_TRAFFIC_TYPES as readonly string[]).includes(key)) {
    throw new ValidationError("Tipo de tráfico inválido.");
  }
  return key as WholesaleTrafficType;
}

function parseQuality(value: unknown): WholesaleQualityEstimate {
  const key = String(value ?? "unknown").trim().toLowerCase();
  if (!(WHOLESALE_QUALITY_ESTIMATES as readonly string[]).includes(key)) {
    throw new ValidationError("Calidad estimada inválida.");
  }
  return key as WholesaleQualityEstimate;
}

function parseProviderConnection(value: unknown): WholesaleProviderConnectionType {
  const key = String(value ?? "http_api").trim().toLowerCase();
  if (!(WHOLESALE_PROVIDER_CONNECTION_TYPES as readonly string[]).includes(key)) {
    throw new ValidationError("Tipo de conexión de proveedor inválido.");
  }
  return key as WholesaleProviderConnectionType;
}

function parseCustomerConnection(value: unknown): WholesaleCustomerConnectionType {
  const key = String(value ?? "api").trim().toLowerCase();
  if (!(WHOLESALE_CUSTOMER_CONNECTION_TYPES as readonly string[]).includes(key)) {
    throw new ValidationError("Tipo de conexión solicitada inválido.");
  }
  return key as WholesaleCustomerConnectionType;
}

function parseOptionalInt(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError("Volumen debe ser un entero positivo.");
  }
  return n;
}

function parseDecimal(value: unknown, field: string): number {
  const raw = String(value ?? "0").trim().replace(",", ".");
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${field} debe ser un número válido.`);
  }
  return n;
}

function parseOptionalUuid(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function parseOptionalDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError("Fecha inválida.");
  }
  return d.toISOString();
}

function rowNotFound(entity: string): never {
  throw new NotFoundError(`${entity} no encontrado.`);
}

// ── Providers ────────────────────────────────────────────────────────────────

export async function listWholesaleProviders(): Promise<WholesaleProviderRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_providers")
    .select("*")
    .order("name", { ascending: true });
  dbError(error, "wholesale");
  return (data ?? []) as WholesaleProviderRow[];
}

export async function getWholesaleProviderById(
  id: string,
): Promise<WholesaleProviderRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Proveedor wholesale");
  return data as WholesaleProviderRow;
}

export function parseWholesaleProviderForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  const code = String(r.code ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!name) throw new ValidationError("Nombre es obligatorio.");
  if (!code) throw new ValidationError("Código es obligatorio.");
  return {
    name,
    code,
    contact_name: String(r.contact_name ?? "").trim() || null,
    contact_email: String(r.contact_email ?? "").trim() || null,
    contact_whatsapp: String(r.contact_whatsapp ?? "").trim() || null,
    country_code: String(r.country_code ?? "CL").trim().toUpperCase(),
    connection_type: parseProviderConnection(r.connection_type),
    notes: String(r.notes ?? "").trim() || null,
    status: parseStatus(r.status),
  };
}

export async function createWholesaleProvider(
  input: ReturnType<typeof parseWholesaleProviderForm>,
): Promise<WholesaleProviderRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_providers")
    .insert(input)
    .select("*")
    .single();
  dbError(error, "wholesale");
  return data as WholesaleProviderRow;
}

export async function updateWholesaleProvider(
  id: string,
  input: ReturnType<typeof parseWholesaleProviderForm>,
): Promise<WholesaleProviderRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_providers")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Proveedor wholesale");
  return data as WholesaleProviderRow;
}

export async function deleteWholesaleProvider(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("wholesale_providers").delete().eq("id", id);
  dbError(error, "wholesale");
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function listWholesaleRoutes(): Promise<WholesaleRouteWithProvider[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_routes")
    .select("*, wholesale_providers(name, code)")
    .order("country_code", { ascending: true })
    .order("operator_name", { ascending: true });
  dbError(error, "wholesale");
  return (data ?? []).map((row) => {
    const r = row as WholesaleRouteRow & {
      wholesale_providers?: { name: string; code: string } | null;
    };
    return {
      ...r,
      provider_name: r.wholesale_providers?.name,
      provider_code: r.wholesale_providers?.code,
    };
  });
}

export async function getWholesaleRouteById(
  id: string,
): Promise<WholesaleRouteWithProvider> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_routes")
    .select("*, wholesale_providers(name, code)")
    .eq("id", id)
    .maybeSingle();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Ruta wholesale");
  const r = data as WholesaleRouteRow & {
    wholesale_providers?: { name: string; code: string } | null;
  };
  return {
    ...r,
    provider_name: r.wholesale_providers?.name,
    provider_code: r.wholesale_providers?.code,
  };
}

export function parseWholesaleRouteForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const provider_id = String(r.provider_id ?? "").trim();
  const operator_name = String(r.operator_name ?? "").trim();
  if (!provider_id) throw new ValidationError("Proveedor es obligatorio.");
  if (!operator_name) throw new ValidationError("Operador es obligatorio.");
  return {
    provider_id,
    country_code: String(r.country_code ?? "CL").trim().toUpperCase(),
    country_name: String(r.country_name ?? "").trim() || null,
    operator_name,
    traffic_type: parseTrafficType(r.traffic_type),
    cost: parseDecimal(r.cost, "Costo"),
    sale_price: parseDecimal(r.sale_price, "Precio venta"),
    currency: String(r.currency ?? "USD").trim().toUpperCase(),
    tps: Math.max(1, parseOptionalInt(r.tps) ?? 1),
    quality_estimate: parseQuality(r.quality_estimate),
    notes: String(r.notes ?? "").trim() || null,
    status: parseStatus(r.status),
  };
}

export async function createWholesaleRoute(
  input: ReturnType<typeof parseWholesaleRouteForm>,
): Promise<WholesaleRouteRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_routes")
    .insert(input)
    .select("*")
    .single();
  dbError(error, "wholesale");
  return data as WholesaleRouteRow;
}

export async function updateWholesaleRoute(
  id: string,
  input: ReturnType<typeof parseWholesaleRouteForm>,
): Promise<WholesaleRouteRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_routes")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Ruta wholesale");
  return data as WholesaleRouteRow;
}

export async function deleteWholesaleRoute(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("wholesale_routes").delete().eq("id", id);
  dbError(error, "wholesale");
}

// ── Rate offers ──────────────────────────────────────────────────────────────

export async function listWholesaleRateOffers(): Promise<WholesaleRateOfferWithProvider[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_rate_offers")
    .select("*, wholesale_providers(name)")
    .order("created_at", { ascending: false });
  dbError(error, "wholesale");
  return (data ?? []).map((row) => {
    const r = row as WholesaleRateOfferRow & {
      wholesale_providers?: { name: string } | null;
    };
    return { ...r, provider_name: r.wholesale_providers?.name };
  });
}

export async function getWholesaleRateOfferById(
  id: string,
): Promise<WholesaleRateOfferWithProvider> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_rate_offers")
    .select("*, wholesale_providers(name)")
    .eq("id", id)
    .maybeSingle();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Oferta de rates");
  const r = data as WholesaleRateOfferRow & {
    wholesale_providers?: { name: string } | null;
  };
  return { ...r, provider_name: r.wholesale_providers?.name };
}

export function parseWholesaleRateOfferForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const raw_text = String(r.raw_text ?? "").trim();
  if (!raw_text) throw new ValidationError("Texto de la oferta es obligatorio.");
  return {
    provider_id: parseOptionalUuid(r.provider_id),
    title: String(r.title ?? "").trim() || null,
    raw_text,
    country_code: String(r.country_code ?? "").trim().toUpperCase() || null,
    parsed_notes: String(r.parsed_notes ?? "").trim() || null,
    status: parseStatus(r.status),
    received_at: parseOptionalDate(r.received_at),
  };
}

export async function createWholesaleRateOffer(
  input: ReturnType<typeof parseWholesaleRateOfferForm>,
): Promise<WholesaleRateOfferRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_rate_offers")
    .insert(input)
    .select("*")
    .single();
  dbError(error, "wholesale");
  return data as WholesaleRateOfferRow;
}

export async function updateWholesaleRateOffer(
  id: string,
  input: ReturnType<typeof parseWholesaleRateOfferForm>,
): Promise<WholesaleRateOfferRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_rate_offers")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Oferta de rates");
  return data as WholesaleRateOfferRow;
}

export async function deleteWholesaleRateOffer(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("wholesale_rate_offers").delete().eq("id", id);
  dbError(error, "wholesale");
}

// ── Route tests ──────────────────────────────────────────────────────────────

export async function listWholesaleRouteTests(): Promise<WholesaleRouteTestEnriched[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_route_tests")
    .select(
      "*, wholesale_providers(name), wholesale_routes(country_code, operator_name)",
    )
    .order("created_at", { ascending: false });
  dbError(error, "wholesale");
  return (data ?? []).map((row) => {
    const r = row as WholesaleRouteTestRow & {
      wholesale_providers?: { name: string } | null;
      wholesale_routes?: { country_code: string; operator_name: string } | null;
    };
    const routeLabel = r.wholesale_routes
      ? `${r.wholesale_routes.country_code} · ${r.wholesale_routes.operator_name}`
      : undefined;
    return {
      ...r,
      provider_name: r.wholesale_providers?.name,
      route_label: routeLabel,
    };
  });
}

export async function getWholesaleRouteTestById(
  id: string,
): Promise<WholesaleRouteTestEnriched> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_route_tests")
    .select(
      "*, wholesale_providers(name), wholesale_routes(country_code, operator_name)",
    )
    .eq("id", id)
    .maybeSingle();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Prueba de ruta");
  const r = data as WholesaleRouteTestRow & {
    wholesale_providers?: { name: string } | null;
    wholesale_routes?: { country_code: string; operator_name: string } | null;
  };
  return {
    ...r,
    provider_name: r.wholesale_providers?.name,
    route_label: r.wholesale_routes
      ? `${r.wholesale_routes.country_code} · ${r.wholesale_routes.operator_name}`
      : undefined,
  };
}

export function parseWholesaleRouteTestForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  return {
    route_id: parseOptionalUuid(r.route_id),
    provider_id: parseOptionalUuid(r.provider_id),
    test_number: String(r.test_number ?? "").trim() || null,
    destination_country: String(r.destination_country ?? "").trim().toUpperCase() || null,
    notes: String(r.notes ?? "").trim() || null,
    result_summary: String(r.result_summary ?? "").trim() || null,
    delivery_status: String(r.delivery_status ?? "").trim() || null,
    tested_at: parseOptionalDate(r.tested_at),
    status: parseStatus(r.status),
  };
}

export async function createWholesaleRouteTest(
  input: ReturnType<typeof parseWholesaleRouteTestForm>,
): Promise<WholesaleRouteTestRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_route_tests")
    .insert(input)
    .select("*")
    .single();
  dbError(error, "wholesale");
  return data as WholesaleRouteTestRow;
}

export async function updateWholesaleRouteTest(
  id: string,
  input: ReturnType<typeof parseWholesaleRouteTestForm>,
): Promise<WholesaleRouteTestRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_route_tests")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Prueba de ruta");
  return data as WholesaleRouteTestRow;
}

export async function deleteWholesaleRouteTest(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("wholesale_route_tests").delete().eq("id", id);
  dbError(error, "wholesale");
}

// ── Customers ────────────────────────────────────────────────────────────────

export async function listWholesaleCustomers(): Promise<WholesaleCustomerRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_customers")
    .select("*")
    .order("company_name", { ascending: true });
  dbError(error, "wholesale");
  return (data ?? []) as WholesaleCustomerRow[];
}

export async function getWholesaleCustomerById(
  id: string,
): Promise<WholesaleCustomerRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Cliente wholesale");
  return data as WholesaleCustomerRow;
}

export function parseWholesaleCustomerForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const company_name = String(r.company_name ?? "").trim();
  if (!company_name) throw new ValidationError("Empresa es obligatoria.");
  return {
    company_name,
    contact_name: String(r.contact_name ?? "").trim() || null,
    email: String(r.email ?? "").trim() || null,
    whatsapp: String(r.whatsapp ?? "").trim() || null,
    country_code: String(r.country_code ?? "CL").trim().toUpperCase(),
    country_name: String(r.country_name ?? "").trim() || null,
    connection_type: parseCustomerConnection(r.connection_type),
    monthly_volume_estimate: parseOptionalInt(r.monthly_volume_estimate),
    commercial_status: parseStatus(r.commercial_status, "estado comercial"),
    notes: String(r.notes ?? "").trim() || null,
  };
}

export async function createWholesaleCustomer(
  input: ReturnType<typeof parseWholesaleCustomerForm>,
): Promise<WholesaleCustomerRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_customers")
    .insert(input)
    .select("*")
    .single();
  dbError(error, "wholesale");
  return data as WholesaleCustomerRow;
}

export async function updateWholesaleCustomer(
  id: string,
  input: ReturnType<typeof parseWholesaleCustomerForm>,
): Promise<WholesaleCustomerRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_customers")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Cliente wholesale");
  return data as WholesaleCustomerRow;
}

export async function deleteWholesaleCustomer(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("wholesale_customers").delete().eq("id", id);
  dbError(error, "wholesale");
}

// ── Opportunities ────────────────────────────────────────────────────────────

export async function listWholesaleOpportunities(): Promise<WholesaleOpportunityWithCustomer[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_opportunities")
    .select("*, wholesale_customers(company_name)")
    .order("created_at", { ascending: false });
  dbError(error, "wholesale");
  return (data ?? []).map((row) => {
    const r = row as WholesaleOpportunityRow & {
      wholesale_customers?: { company_name: string } | null;
    };
    return { ...r, company_name: r.wholesale_customers?.company_name };
  });
}

export async function getWholesaleOpportunityById(
  id: string,
): Promise<WholesaleOpportunityWithCustomer> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_opportunities")
    .select("*, wholesale_customers(company_name)")
    .eq("id", id)
    .maybeSingle();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Oportunidad comercial");
  const r = data as WholesaleOpportunityRow & {
    wholesale_customers?: { company_name: string } | null;
  };
  return { ...r, company_name: r.wholesale_customers?.company_name };
}

export function parseWholesaleOpportunityForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const customer_id = String(r.customer_id ?? "").trim();
  if (!customer_id) throw new ValidationError("Cliente es obligatorio.");
  const targetRaw = String(r.target_price ?? "").trim();
  return {
    customer_id,
    country_code: String(r.country_code ?? "").trim().toUpperCase() || null,
    country_name: String(r.country_name ?? "").trim() || null,
    traffic_type: parseTrafficType(r.traffic_type),
    volume_estimate: parseOptionalInt(r.volume_estimate),
    target_price: targetRaw ? parseDecimal(r.target_price, "Precio objetivo") : null,
    currency: String(r.currency ?? "USD").trim().toUpperCase(),
    commercial_status: parseStatus(r.commercial_status, "estado comercial"),
    notes: String(r.notes ?? "").trim() || null,
  };
}

export async function createWholesaleOpportunity(
  input: ReturnType<typeof parseWholesaleOpportunityForm>,
): Promise<WholesaleOpportunityRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_opportunities")
    .insert(input)
    .select("*")
    .single();
  dbError(error, "wholesale");
  return data as WholesaleOpportunityRow;
}

export async function updateWholesaleOpportunity(
  id: string,
  input: ReturnType<typeof parseWholesaleOpportunityForm>,
): Promise<WholesaleOpportunityRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("wholesale_opportunities")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  dbError(error, "wholesale");
  if (!data) rowNotFound("Oportunidad comercial");
  return data as WholesaleOpportunityRow;
}

export async function deleteWholesaleOpportunity(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("wholesale_opportunities")
    .delete()
    .eq("id", id);
  dbError(error, "wholesale");
}

export function computeRouteMargin(cost: number, salePrice: number): number {
  return salePrice - cost;
}

export function formatRouteMarginPct(cost: number, salePrice: number): string {
  if (cost <= 0) return "—";
  const pct = ((salePrice - cost) / cost) * 100;
  return `${pct.toFixed(1)}%`;
}

const OPEN_OPPORTUNITY_STATUSES = new Set<WholesaleStatus>([
  "draft",
  "testing",
  "approved",
]);

export async function buildWholesaleDashboardSnapshot(): Promise<WholesaleDashboardSnapshot> {
  const [providers, routes, offers, tests, customers, opportunities] =
    await Promise.all([
      listWholesaleProviders(),
      listWholesaleRoutes(),
      listWholesaleRateOffers(),
      listWholesaleRouteTests(),
      listWholesaleCustomers(),
      listWholesaleOpportunities(),
    ]);

  const activeProviders = providers.filter((p) =>
    p.status === "live" || p.status === "approved",
  ).length;
  const routesLive = routes.filter((r) => r.status === "live").length;
  const routesTesting = routes.filter((r) => r.status === "testing").length;
  const pendingOffers = offers.filter((o) =>
    o.status === "draft" || o.status === "testing",
  ).length;
  const openOpportunities = opportunities.filter((o) =>
    OPEN_OPPORTUNITY_STATUSES.has(o.commercial_status),
  ).length;

  const sellableRoutes = routes
    .filter((r) => r.status === "live" || r.status === "approved")
    .slice(0, 6);
  const pendingOffersList = offers
    .filter((o) => o.status === "draft" || o.status === "testing")
    .slice(0, 5);
  const recentTests = tests.slice(0, 5);
  const pipelineOpportunities = opportunities.slice(0, 5);

  return {
    kpis: {
      activeProviders,
      routesLive,
      routesTesting,
      pendingOffers,
      customers: customers.length,
      openOpportunities,
    },
    sellableRoutes,
    pendingOffers: pendingOffersList,
    recentTests,
    pipelineOpportunities,
  };
}
