/**
 * Reparación idempotente — orden TV-MQB4Z880-38FE01 / licantravel@gmail.com
 * Mueve numeración a la company del login OAuth (d7a134e0) y consolida duplicados.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ORDER_REF = "TV-MQB4Z880-38FE01";
const TARGET_COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";
const KEEP_CLIENT_NUMBER_ID = "acef4e67-ebda-4db8-a948-38db812127df";
const DUPLICATE_CLIENT_NUMBER_ID = "f5d41cc1-ad6f-4824-894a-bd294c2df59b";
const INVENTORY_ID = "3c35bdf7-4b15-42ee-9a5b-f8921f3a8a03";

async function main() {
  const { data: order, error: orderErr } = await sb
    .from("sms_orders")
    .select("id, company_id, payment_status, credit_status, checkout_email")
    .eq("public_checkout_reference", ORDER_REF)
    .maybeSingle();
  if (orderErr || !order) throw new Error("order_not_found");

  console.log("order_id", order.id, "payment_status", order.payment_status);

  const { data: dupCn } = await sb
    .from("client_numbers")
    .select("id")
    .eq("id", DUPLICATE_CLIENT_NUMBER_ID)
    .maybeSingle();
  if (dupCn) {
    const { error } = await sb.from("client_numbers").delete().eq("id", DUPLICATE_CLIENT_NUMBER_ID);
    if (error) throw error;
    console.log("deleted duplicate client_number", DUPLICATE_CLIENT_NUMBER_ID);
  } else {
    console.log("duplicate client_number already absent");
  }

  const { error: cnMoveErr } = await sb
    .from("client_numbers")
    .update({
      company_id: TARGET_COMPANY_ID,
      status: "active",
      activated_at: new Date().toISOString(),
    })
    .eq("id", KEEP_CLIENT_NUMBER_ID);
  if (cnMoveErr) throw cnMoveErr;
  console.log("moved client_number to target company");

  const { error: orderPatchErr } = await sb
    .from("sms_orders")
    .update({ company_id: TARGET_COMPANY_ID })
    .eq("id", order.id);
  if (orderPatchErr) throw orderPatchErr;

  const { error: actErr } = await sb
    .from("sim_activation_requests")
    .update({
      company_id: TARGET_COMPANY_ID,
      client_number_id: KEEP_CLIENT_NUMBER_ID,
      activation_status: "active",
      activated_at: new Date().toISOString(),
    })
    .eq("order_id", order.id);
  if (actErr) throw actErr;

  const { error: invErr } = await sb
    .from("real_number_inventory")
    .update({
      current_company_id: TARGET_COMPANY_ID,
      current_client_number_id: KEEP_CLIENT_NUMBER_ID,
      sales_status: "active_assigned",
    })
    .eq("id", INVENTORY_ID);
  if (invErr) throw invErr;

  const { error: agentErr } = await sb
    .from("agent_plan_requests")
    .update({ company_id: TARGET_COMPANY_ID })
    .eq("order_id", order.id);
  if (agentErr && !String(agentErr.message).includes("does not exist")) {
    throw agentErr;
  }

  const { data: walletExists } = await sb
    .from("sms_wallets")
    .select("id")
    .eq("company_id", TARGET_COMPANY_ID)
    .maybeSingle();
  if (!walletExists) {
    const { error: wErr } = await sb.from("sms_wallets").insert({
      company_id: TARGET_COMPANY_ID,
      currency: "CLP",
      balance_sms: 0,
    });
    if (wErr && wErr.code !== "23505") throw wErr;
    console.log("created wallet for target company");
  }

  const { count } = await sb
    .from("client_numbers")
    .select("id", { count: "exact", head: true })
    .eq("company_id", TARGET_COMPANY_ID);
  console.log("client_numbers on target company:", count);

  const { data: activation } = await sb
    .from("sim_activation_requests")
    .select("activation_status, client_number_id, company_id")
    .eq("order_id", order.id)
    .maybeSingle();
  console.log("activation final", activation);
  console.log("repair_ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
