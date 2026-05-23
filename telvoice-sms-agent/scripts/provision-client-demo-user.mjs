#!/usr/bin/env node
/**
 * Provisiona usuario demo cliente para /app (idempotente).
 *
 * Seguridad:
 * - Lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY solo desde process.env / .env local.
 * - No incluye contraseñas, JWT ni claves en el repositorio.
 * - La contraseña temporal se genera en runtime y se imprime una sola vez en consola.
 * - No se ejecuta en deploy ni en CI; uso manual por operador.
 *
 * Requisitos: .env con credenciales Supabase (no commitear .env).
 *
 * Uso:
 *   cd telvoice-sms-agent
 *   node scripts/provision-client-demo-user.mjs
 *   node scripts/provision-client-demo-user.mjs --reset-password
 */
import crypto from "node:crypto";
import "dotenv/config";
import bcrypt from "bcrypt";
import { createClient } from "@supabase/supabase-js";

const EMAIL = "cliente.demo@telvoice.cl";
const FULL_NAME = "Cliente Demo Telvoice";
const ROLE = "client_owner";
const COMPANY_ID = "6cd1db92-d5c7-45e0-8548-df8907843350";
const BCRYPT_ROUNDS = 12;

const resetPassword = process.argv.includes("--reset-password");

function generatePassword() {
  const rand = crypto.randomBytes(4).toString("hex");
  return `ClienteDemo-${rand}-2026!`;
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const ADMIN_PUBLIC_COLUMNS =
  "id, email, name, role, created_at, updated_at";

async function findAdminByEmail(email) {
  const { data, error } = await sb
    .from("admin_users")
    .select(ADMIN_PUBLIC_COLUMNS)
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function upsertProfile(adminUserId) {
  const { data: byAdmin } = await sb
    .from("user_profiles")
    .select("*")
    .eq("admin_user_id", adminUserId)
    .maybeSingle();

  const { data: byEmail } = await sb
    .from("user_profiles")
    .select("*")
    .ilike("email", EMAIL)
    .maybeSingle();

  const existing = byAdmin ?? byEmail;

  const row = {
    admin_user_id: adminUserId,
    email: EMAIL,
    full_name: FULL_NAME,
    role: ROLE,
    company_id: COMPANY_ID,
    status: "active",
    user_id: null,
  };

  if (existing) {
    const { data, error } = await sb
      .from("user_profiles")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { profile: data, created: false };
  }

  const { data, error } = await sb
    .from("user_profiles")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { profile: data, created: true };
}

async function upsertCompanyUser(profileId) {
  const { data: existing } = await sb
    .from("company_users")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await sb
      .from("company_users")
      .update({ role: ROLE, status: "active" })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { companyUser: data, created: false };
  }

  const { data, error } = await sb
    .from("company_users")
    .insert({
      company_id: COMPANY_ID,
      profile_id: profileId,
      user_id: null,
      role: ROLE,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { companyUser: data, created: true };
}

async function audit(actorAdminId, profileId) {
  try {
    await sb.from("audit_logs").insert({
      actor_user_id: actorAdminId,
      actor_role: "system",
      company_id: COMPANY_ID,
      action: "client_demo.create_or_update",
      entity_type: "user_profile",
      entity_id: profileId,
      metadata: {
        email: EMAIL,
        company_id: COMPANY_ID,
        role: ROLE,
        purpose: "QA panel cliente /app",
      },
    });
  } catch {
    /* no bloquear */
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
    process.exit(1);
  }

  const { data: victor } = await sb
    .from("user_profiles")
    .select("email, role, company_id")
    .eq("email", "victor@telvoice.net")
    .maybeSingle();

  let admin = await findAdminByEmail(EMAIL);
  let passwordPlain = null;
  let adminCreated = false;

  if (!admin) {
    passwordPlain = generatePassword();
    const password_hash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);
    const { data, error } = await sb
      .from("admin_users")
      .insert({
        email: EMAIL,
        password_hash,
        name: FULL_NAME,
        role: ROLE,
      })
      .select(ADMIN_PUBLIC_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    admin = data;
    adminCreated = true;
  } else {
    const patch = { name: FULL_NAME, role: ROLE };
    if (resetPassword) {
      passwordPlain = generatePassword();
      patch.password_hash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);
    }
    const { data, error } = await sb
      .from("admin_users")
      .update(patch)
      .eq("id", admin.id)
      .select(ADMIN_PUBLIC_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    admin = data;
  }

  const { profile, created: profileCreated } = await upsertProfile(admin.id);
  const { companyUser, created: cuCreated } = await upsertCompanyUser(
    profile.id,
  );

  await audit(admin.id, profile.id);

  const { data: victorAfter } = await sb
    .from("user_profiles")
    .select("email, role, company_id")
    .eq("email", "victor@telvoice.net")
    .maybeSingle();

  console.log(JSON.stringify({
    action: adminCreated ? "created" : "updated",
    admin_user_id: admin.id,
    profile_id: profile.id,
    company_user_id: companyUser.id,
    company_id: COMPANY_ID,
    role: profile.role,
    profile_created: profileCreated,
    company_user_created: cuCreated,
    victor_before: victor,
    victor_after: victorAfter,
    password_issued: Boolean(passwordPlain),
  }, null, 2));

  if (passwordPlain) {
    console.log("\n=== CONTRASEÑA TEMPORAL (mostrar una sola vez) ===");
    console.log(passwordPlain);
    console.log("================================================\n");
  } else {
    console.log("\nUsuario ya existía — contraseña sin cambios. Usa --reset-password para generar una nueva.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
