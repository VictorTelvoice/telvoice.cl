import { createHash } from "node:crypto";
import { getSupabase } from "../database/supabaseClient.js";
import { ROLES } from "../types/roles.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { findAdminByEmail, createAdminUser } from "./adminUserService.js";
import {
  hashPassword,
  signAdminToken,
  getAdminJwtCookieName,
  getClientJwtCookieName,
  getJwtCookieOptions,
} from "./adminAuthService.js";
import type { AdminSessionUser } from "../types/admin.js";
import { AppError } from "../utils/errors.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import { resolveCompanyForClientLogin } from "./googleLoginTenantResolution.js";

export async function bootstrapClientFromGoogle(input: {
  supabaseUserId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}): Promise<{ user: AdminSessionUser; jwt: string; isNewAccount: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!email) {
    throw new AppError("Email requerido.", 400);
  }

  // 1) Admin user (sesión actual del panel usa admin_users + JWT)
  const existing = await findAdminByEmail(email);
  const hadAdmin = Boolean(existing);
  const admin =
    existing ??
    (await createAdminUser({
      email,
      password_hash: await hashPassword(
        createHash("sha256")
          .update(`${input.supabaseUserId}:${Date.now()}`)
          .digest("hex"),
      ),
      name: input.name.trim() || email,
      role: ROLES.CLIENT_OWNER,
    }));

  const sessionUser: AdminSessionUser = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };

  // 2) Company + profile (multi-tenant)
  const { data: existingProfile, error: profErr } = await getSupabase()
    .from("user_profiles")
    .select("id, company_id, role, status")
    .eq("admin_user_id", admin.id)
    .maybeSingle();
  if (profErr) {
    wrapSupabaseError(profErr, "bootstrapClient.profile.select");
  }

  const hadCompany = Boolean(existingProfile?.company_id);
  const isNewAccount = !hadAdmin || !hadCompany;

  let companyId: string | null = existingProfile?.company_id ?? null;
  const tenantResolution = await resolveCompanyForClientLogin(email, companyId);

  if (tenantResolution.action === "blocked_multiple_candidates") {
    throw new AppError(
      "Tu cuenta requiere revisión manual para vincular la empresa correcta. Contacta a soporte@telvoice.cl.",
      409,
      "TENANT_MANUAL_REVIEW_REQUIRED",
    );
  }

  if (tenantResolution.companyId) {
    companyId = tenantResolution.companyId;
  }

  if (!companyId) {
    const companyName = input.name.trim() || email.split("@")[0] || "Cliente Telvoice";
    const { data: company, error: compErr } = await getSupabase()
      .from("companies")
      .insert({
        name: companyName,
        legal_name: null,
        rut: null,
        billing_email: email,
        contact_name: input.name.trim() || null,
        contact_phone: null,
        country: "CL",
        status: "active",
        metadata: {
          source: "google_oauth",
          supabase_user_id: input.supabaseUserId,
          avatar_url: input.avatarUrl ?? null,
        },
      })
      .select("id")
      .single();
    if (compErr) {
      wrapSupabaseError(compErr, "bootstrapClient.company.insert");
    }
    companyId = company?.id ?? null;
  }

  // Upsert profile by admin_user_id (unique index)
  const { error: upErr } = await getSupabase()
    .from("user_profiles")
    .upsert(
      {
        admin_user_id: admin.id,
        user_id: input.supabaseUserId,
        company_id: companyId,
        full_name: input.name.trim() || admin.name,
        email,
        role: ROLES.CLIENT_OWNER,
        status: "active",
      },
      { onConflict: "admin_user_id" },
    );
  if (upErr) {
    wrapSupabaseError(upErr, "bootstrapClient.profile.upsert");
  }

  if (companyId) {
    await getOrCreateCompanyWallet(companyId, "CL");
    try {
      const { reconcilePaidPurchasesForEmail } = await import(
        "./billingPurchaseReconciliationService.js"
      );
      // Solo evaluación en login: no acreditar ni re-vincular órdenes automáticamente.
      await reconcilePaidPurchasesForEmail(email, {
        dryRun: true,
        actorUserId: admin.id,
        source: "google_bootstrap_deferred",
      });
    } catch (reconcileErr) {
      console.error("[bootstrap] paid purchase reconcile assessment failed", email, reconcileErr);
    }
  }

  return { user: sessionUser, jwt: signAdminToken(sessionUser), isNewAccount };
}

export { getAdminJwtCookieName, getClientJwtCookieName, getJwtCookieOptions };
