import { getSupabase } from "../database/supabaseClient.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { patchOrderFields } from "./smsOrderService.js";
import { linkSimActivationToCompany } from "./simActivationService.js";

export type CheckoutProvisionInput = {
  order: SmsOrderRow;
  checkoutEmail: string;
  payerName?: string;
  companyName?: string;
  phone?: string;
  taxId?: string;
  useCase?: string;
};

export type CheckoutProvisionResult = {
  companyId: string;
  isNewCompany: boolean;
  identityReviewRequired: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeRut(rut: string | null | undefined): string | null {
  if (!rut) return null;
  const cleaned = rut.replace(/[.\-\s]/g, "").toUpperCase();
  return cleaned.length >= 7 ? cleaned : null;
}

function companyNameDiffers(
  existingName: string | null | undefined,
  submitted: string | null | undefined,
): boolean {
  const a = (existingName ?? "").trim().toLowerCase();
  const b = (submitted ?? "").trim().toLowerCase();
  if (!a || !b) return false;
  return a !== b;
}

async function findCompanyByEmail(email: string): Promise<{
  id: string;
  name: string;
  rut: string | null;
  billing_email: string | null;
} | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("companies")
    .select("id, name, rut, billing_email")
    .ilike("billing_email", email)
    .maybeSingle();
  if (error) {
    wrapSupabaseError(error, "provision.findCompanyByEmail");
  }
  return data as typeof data;
}

async function findCompanyByProfileEmail(email: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("user_profiles")
    .select("company_id")
    .ilike("email", email)
    .not("company_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    wrapSupabaseError(error, "provision.findCompanyByProfileEmail");
  }
  return data?.company_id ?? null;
}

async function loadCompany(
  companyId: string,
): Promise<{ id: string; name: string; rut: string | null } | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("companies")
    .select("id, name, rut")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    wrapSupabaseError(error, "provision.loadCompany");
  }
  return data as typeof data;
}

export async function provisionCompanyFromCheckout(
  input: CheckoutProvisionInput,
): Promise<CheckoutProvisionResult> {
  const email = normalizeEmail(input.checkoutEmail);
  const submittedRut = normalizeRut(input.taxId);
  const submittedCompanyName =
    input.companyName?.trim() || input.payerName?.trim() || null;

  let companyId: string | null = null;
  let isNewCompany = false;
  let identityReviewRequired = false;

  const byEmail = await findCompanyByEmail(email);
  if (byEmail?.id) {
    companyId = byEmail.id;
    const existingRut = normalizeRut(byEmail.rut);
    if (submittedRut && existingRut && submittedRut !== existingRut) {
      identityReviewRequired = true;
    }
    if (companyNameDiffers(byEmail.name, submittedCompanyName)) {
      identityReviewRequired = true;
    }
  }

  if (!companyId) {
    const profileCompanyId = await findCompanyByProfileEmail(email);
    if (profileCompanyId) {
      companyId = profileCompanyId;
      const existing = await loadCompany(profileCompanyId);
      if (existing) {
        const existingRut = normalizeRut(existing.rut);
        if (submittedRut && existingRut && submittedRut !== existingRut) {
          identityReviewRequired = true;
        }
        if (companyNameDiffers(existing.name, submittedCompanyName)) {
          identityReviewRequired = true;
        }
      }
    }
  }

  const sb = getSupabase();

  if (!companyId) {
    const displayName =
      submittedCompanyName || input.payerName?.trim() || email.split("@")[0] || "Cliente Telvoice";
    const { data: company, error: compErr } = await sb
      .from("companies")
      .insert({
        name: displayName,
        legal_name: input.companyName?.trim() || null,
        rut: input.taxId?.trim() || null,
        billing_email: email,
        contact_name: input.payerName?.trim() || null,
        contact_phone: input.phone?.trim() || null,
        country: "CL",
        status: "active",
        metadata: {
          source: "landing_sim_agent_builder",
          first_order_id: input.order.id,
          account_creation_mode: "post_payment_auto",
        },
      })
      .select("id")
      .single();
    if (compErr) {
      wrapSupabaseError(compErr, "provision.company.insert");
    }
    companyId = company?.id ?? null;
    isNewCompany = true;
  }

  if (!companyId) {
    throw new Error("provision_company_failed");
  }

  await getOrCreateCompanyWallet(companyId, "CL");

  const nowIso = new Date().toISOString();
  const orderMeta = input.order.metadata ?? {};

  await patchOrderFields(input.order.id, {
    company_id: companyId,
    credit_status: "pending",
    claim_status: "claimed",
    claimed_at: nowIso,
    metadata: {
      ...orderMeta,
      account_provisioned_at: nowIso,
      identity_review_required: identityReviewRequired,
      provision_is_new_company: isNewCompany,
    },
  });

  await linkSimActivationToCompany(input.order.id, companyId);

  return { companyId, isNewCompany, identityReviewRequired };
}
