import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ref = "TV-MQB4Z880-38FE01";
const mpPaymentId = "162998013387";

const { data: orders } = await sb
  .from("sms_orders")
  .select("*")
  .eq("public_checkout_reference", ref)
  .limit(1);
const order = orders?.[0];
if (!order) {
  console.log("ORDER NOT FOUND");
  process.exit(1);
}

const meta = order.metadata || {};
console.log("=== ORDER ===");
console.log(
  JSON.stringify(
    {
      id: order.id,
      payment_status: order.payment_status,
      credit_status: order.credit_status,
      amount: order.amount,
      checkout_email: order.checkout_email,
      company_id: order.company_id,
      product_type: meta.product_type,
      sim_plan_id: meta.sim_plan_id,
      inventory_number_id: meta.inventory_number_id,
      number_suffix: meta.number_suffix,
      test_price_override: meta.test_price_override,
      mercadopago_payment_id: meta.mercadopago_payment_id,
      mercadopago_status: meta.mercadopago_status,
      mercadopago_processed_at: meta.mercadopago_processed_at,
      mercadopago_webhook_at: meta.mercadopago_webhook_at,
      activation_status: meta.activation_status,
    },
    null,
    2,
  ),
);

const { data: activation } = await sb
  .from("sim_activation_requests")
  .select("*")
  .eq("order_id", order.id)
  .maybeSingle();
console.log("\n=== SIM ACTIVATION ===");
console.log(JSON.stringify(activation, null, 2));

if (activation?.inventory_number_id) {
  const { data: inv } = await sb
    .from("real_number_inventory")
    .select(
      "id,sales_status,connection_status,webhook_connected,current_order_id,company_id,assigned_user_id,reserved_until,sold_at,activated_at,number_suffix",
    )
    .eq("id", activation.inventory_number_id)
    .maybeSingle();
  console.log("\n=== INVENTORY ===");
  console.log(JSON.stringify(inv, null, 2));
}

const email = (order.checkout_email || "").toLowerCase();
const { data: companies } = await sb
  .from("companies")
  .select("id,name,billing_email,created_at")
  .ilike("billing_email", email);
console.log("\n=== COMPANIES count", companies?.length);
console.log(JSON.stringify(companies?.map((c) => ({ id: c.id, name: c.name })), null, 2));

const { data: profiles } = await sb
  .from("user_profiles")
  .select("id,email,company_id,role,created_at")
  .ilike("email", email);
console.log("\n=== USER_PROFILES count", profiles?.length);
console.log(
  JSON.stringify(profiles?.map((p) => ({ id: p.id, company_id: p.company_id, role: p.role })), null, 2),
);

if (order.company_id) {
  const { data: wallets } = await sb
    .from("sms_wallets")
    .select("id,company_id,balance_sms,updated_at")
    .eq("company_id", order.company_id);
  console.log("\n=== WALLETS ===");
  console.log(JSON.stringify(wallets, null, 2));

  const { data: clientNums } = await sb
    .from("client_numbers")
    .select("id,company_id,status,type,number_suffix,capabilities,created_at")
    .eq("company_id", order.company_id);
  console.log("\n=== CLIENT_NUMBERS count", clientNums?.length);
  console.log(JSON.stringify(clientNums, null, 2));
}

const { data: emails } = await sb
  .from("email_logs")
  .select("id,template_key,recipient,to_email,status,created_at")
  .eq("order_id", order.id)
  .order("created_at");
console.log("\n=== EMAIL_LOGS count", emails?.length);
console.log(
  JSON.stringify(
    emails?.map((e) => ({
      template: e.template_key,
      recipient: e.recipient || e.to_email,
      status: e.status,
      at: e.created_at,
    })),
    null,
    2,
  ),
);

const { data: mpOrders } = await sb
  .from("sms_orders")
  .select("id,public_checkout_reference")
  .contains("metadata", { mercadopago_payment_id: mpPaymentId });
console.log("\n=== ORDERS WITH MP PAYMENT ID", mpPaymentId, "count", mpOrders?.length);
