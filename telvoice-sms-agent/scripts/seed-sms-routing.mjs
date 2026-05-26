/**
 * Seed opcional — modelo telco SMS (migración 014).
 * Uso: node scripts/seed-sms-routing.mjs
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const DEMO_COMPANY_ID = "6cd1db92-d5c7-45e0-8548-df8907843350";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function upsertProvider() {
  const { data: existing } = await supabase
    .from("sms_providers")
    .select("id")
    .eq("code", "asmsc")
    .maybeSingle();

  if (existing?.id) {
    console.log("Proveedor asmsc ya existe:", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("sms_providers")
    .insert({
      name: "Almuqeet / aSMSC API",
      code: "asmsc",
      type: "http_api",
      status: "active",
      auth_type: "env",
      default_sender_id: process.env.ASMSC_SENDER_ID ?? "TELVOICE",
      supports_dlr: true,
      supports_unicode: true,
      priority: 10,
      metadata: { note: "Credenciales en ASMSC_* env" },
    })
    .select("id")
    .single();

  if (error) throw error;
  console.log("Proveedor creado:", data.id);
  return data.id;
}

async function upsertRoute(providerId) {
  const { data: existing } = await supabase
    .from("sms_routes")
    .select("id")
    .eq("name", "Chile Default HQ")
    .maybeSingle();

  if (existing?.id) {
    console.log("Ruta Chile Default HQ ya existe:", existing.id);
    return existing.id;
  }

  await supabase
    .from("sms_routes")
    .update({ is_default: false })
    .eq("country", "CL");

  const { data, error } = await supabase
    .from("sms_routes")
    .insert({
      provider_id: providerId,
      name: "Chile Default HQ",
      country: "CL",
      operator_name: "Default CL",
      route_type: "hq",
      traffic_type: "transactional",
      status: "active",
      cost_per_sms: 0,
      currency: "USD",
      dlr_enabled: true,
      is_default: true,
      priority: 10,
    })
    .select("id")
    .single();

  if (error) throw error;
  console.log("Ruta creada:", data.id);
  return data.id;
}

async function upsertRatePlan() {
  const { data: existing } = await supabase
    .from("sms_rate_plans")
    .select("id")
    .eq("code", "TELVOICE_CL_RETAIL")
    .maybeSingle();

  if (existing?.id) {
    console.log("Rate plan TELVOICE CL Retail ya existe:", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("sms_rate_plans")
    .insert({
      name: "TELVOICE CL Retail",
      code: "TELVOICE_CL_RETAIL",
      currency: "CLP",
      status: "active",
      description: "Plan retail Chile — demo y clientes estándar",
    })
    .select("id")
    .single();

  if (error) throw error;
  console.log("Rate plan creado:", data.id);
  return data.id;
}

async function upsertDetail(ratePlanId, routeId) {
  const { data: existing } = await supabase
    .from("sms_rate_plan_details")
    .select("id")
    .eq("rate_plan_id", ratePlanId)
    .eq("route_id", routeId)
    .maybeSingle();

  if (existing?.id) {
    console.log("Detalle tarifa ya existe:", existing.id);
    return;
  }

  const { error } = await supabase.from("sms_rate_plan_details").insert({
    rate_plan_id: ratePlanId,
    route_id: routeId,
    country: "CL",
    operator_name: "Default CL",
    traffic_type: "transactional",
    sell_price_per_sms: 1,
    cost_price_per_sms: 0,
    currency: "CLP",
    status: "active",
  });

  if (error) throw error;
  console.log("Detalle tarifa CL default creado");
}

async function assignDemo(ratePlanId) {
  for (const trafficType of ["transactional", "promotional"]) {
    const { data: existing } = await supabase
      .from("company_rate_plans")
      .select("id")
      .eq("company_id", DEMO_COMPANY_ID)
      .eq("country", "CL")
      .eq("traffic_type", trafficType)
      .eq("status", "active")
      .maybeSingle();

    if (existing?.id) {
      console.log(`Empresa Demo ya tiene rate plan (${trafficType}):`, existing.id);
      continue;
    }

    const { error } = await supabase.from("company_rate_plans").insert({
      company_id: DEMO_COMPANY_ID,
      rate_plan_id: ratePlanId,
      country: "CL",
      traffic_type: trafficType,
      status: "active",
      live_enabled: true,
      campaigns_enabled: true,
    });

    if (error) throw error;
    console.log(`Rate plan asignado a Empresa Demo (${trafficType})`);
  }
}

async function main() {
  console.log("Seed SMS routing (014)…");
  const providerId = await upsertProvider();
  const routeId = await upsertRoute(providerId);
  const planId = await upsertRatePlan();
  await upsertDetail(planId, routeId);
  await assignDemo(planId);
  console.log("Listo. Sin envío SMS real.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
