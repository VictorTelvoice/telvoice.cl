/**
 * Seed — 3 proveedores Chile + rate plans (single y balanceado).
 * Uso: node scripts/seed-chile-3-providers.mjs
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const PROVIDERS = [
  {
    code: "asmsc",
    name: "Chile P1 — Almuqeet / aSMSC",
    env_prefix: "ASMSC",
    priority: 10,
    routeName: "Chile P1 HQ",
    isDefault: true,
  },
  {
    code: "chile_p2",
    name: "Chile P2 — Vendor 2",
    env_prefix: "CHILE_P2",
    priority: 20,
    routeName: "Chile P2 HQ",
    isDefault: false,
  },
  {
    code: "chile_p3",
    name: "Chile P3 — Vendor 3",
    env_prefix: "CHILE_P3",
    priority: 30,
    routeName: "Chile P3 HQ",
    isDefault: false,
  },
];

async function upsertProvider(def) {
  const { data: existing } = await supabase
    .from("sms_providers")
    .select("id")
    .eq("code", def.code)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("sms_providers")
      .update({
        name: def.name,
        status: "active",
        metadata: {
          env_prefix: def.env_prefix,
          note: `Credenciales ${def.env_prefix}_API_ID / ${def.env_prefix}_API_PASSWORD`,
        },
      })
      .eq("id", existing.id);
    console.log(`Proveedor ${def.code} actualizado:`, existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("sms_providers")
    .insert({
      name: def.name,
      code: def.code,
      type: "http_api",
      status: "active",
      auth_type: "env",
      default_sender_id: "TELVOICE",
      supports_dlr: true,
      supports_unicode: true,
      priority: def.priority,
      metadata: {
        env_prefix: def.env_prefix,
        note: `Credenciales ${def.env_prefix}_API_ID / ${def.env_prefix}_API_PASSWORD`,
      },
    })
    .select("id")
    .single();

  if (error) throw error;
  console.log(`Proveedor ${def.code} creado:`, data.id);
  return data.id;
}

async function upsertRoute(providerId, def) {
  const { data: existing } = await supabase
    .from("sms_routes")
    .select("id")
    .eq("name", def.routeName)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("sms_routes")
      .update({
        provider_id: providerId,
        status: "active",
        is_default: def.isDefault,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  if (def.isDefault) {
    await supabase
      .from("sms_routes")
      .update({ is_default: false })
      .eq("country", "CL");
  }

  const { data, error } = await supabase
    .from("sms_routes")
    .insert({
      provider_id: providerId,
      name: def.routeName,
      country: "CL",
      operator_name: "Default CL",
      route_type: "hq",
      traffic_type: "transactional",
      status: "active",
      cost_per_sms: 0,
      currency: "USD",
      dlr_enabled: true,
      is_default: def.isDefault,
      priority: def.priority,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function upsertRatePlan(code, name, routingMode, description) {
  const { data: existing } = await supabase
    .from("sms_rate_plans")
    .select("id, metadata")
    .eq("code", code)
    .maybeSingle();

  const metadata = {
    ...(existing?.metadata ?? {}),
    routing_mode: routingMode,
  };

  if (existing?.id) {
    await supabase
      .from("sms_rate_plans")
      .update({ name, description, metadata, status: "active" })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("sms_rate_plans")
    .insert({
      name,
      code,
      currency: "CLP",
      status: "active",
      description,
      metadata,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function upsertDetail(ratePlanId, routeId, weight, sell = 1) {
  const { data: existing } = await supabase
    .from("sms_rate_plan_details")
    .select("id")
    .eq("rate_plan_id", ratePlanId)
    .eq("route_id", routeId)
    .maybeSingle();

  const row = {
    rate_plan_id: ratePlanId,
    route_id: routeId,
    country: "CL",
    operator_name: "Default CL",
    traffic_type: "transactional",
    sell_price_per_sms: sell,
    cost_price_per_sms: 0,
    currency: "CLP",
    status: "active",
    metadata: { weight },
  };

  if (existing?.id) {
    await supabase.from("sms_rate_plan_details").update(row).eq("id", existing.id);
    return;
  }

  const { error } = await supabase.from("sms_rate_plan_details").insert(row);
  if (error) throw error;
}

async function main() {
  console.log("Seed 3 proveedores Chile…\n");

  const routeIds = [];
  for (const def of PROVIDERS) {
    const providerId = await upsertProvider(def);
    const routeId = await upsertRoute(providerId, def);
    routeIds.push({ code: def.code, routeId });
  }

  const singlePlans = [
    { code: "TELVOICE_CL_P1_ONLY", name: "Chile solo P1 (aSMSC)", idx: 0 },
    { code: "TELVOICE_CL_P2_ONLY", name: "Chile solo P2", idx: 1 },
    { code: "TELVOICE_CL_P3_ONLY", name: "Chile solo P3", idx: 2 },
  ];

  for (const sp of singlePlans) {
    const planId = await upsertRatePlan(
      sp.code,
      sp.name,
      "single",
      `Un solo proveedor — ${PROVIDERS[sp.idx].name}`,
    );
    await upsertDetail(planId, routeIds[sp.idx].routeId, 100);
    console.log(`Rate plan ${sp.code} listo`);
  }

  const balancedId = await upsertRatePlan(
    "TELVOICE_CL_BALANCED",
    "Chile balanceado 3 proveedores",
    "weighted",
    "Reparto weighted entre P1, P2 y P3 (34/33/33)",
  );
  const weights = [34, 33, 33];
  for (let i = 0; i < routeIds.length; i++) {
    await upsertDetail(balancedId, routeIds[i].routeId, weights[i]);
  }
  console.log("Rate plan TELVOICE_CL_BALANCED listo");

  console.log("\n✓ Listo. Configure credenciales en .env:");
  console.log("  ASMSC_API_ID / ASMSC_API_PASSWORD (P1)");
  console.log("  CHILE_P2_API_ID / CHILE_P2_API_PASSWORD");
  console.log("  CHILE_P3_API_ID / CHILE_P3_API_PASSWORD");
  console.log("\nAsigne rate plans en /admin/wallets/:companyId");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
