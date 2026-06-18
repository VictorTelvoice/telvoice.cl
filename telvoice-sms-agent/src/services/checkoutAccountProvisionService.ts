import { withPgAdvisoryLock } from "../database/pgClient.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import {
  isDuplicateKeyError,
  wrapSupabaseError,
} from "../utils/supabase-errors.js";
import { getOrderById, patchOrderFields } from "./smsOrderService.js";
import { linkSimActivationToCompany } from "./simActivationService.js";

export type CheckoutProvisionInput = {
  order: SmsOrderRow;
  checkoutEmail: string;
  payerName?: string;
  companyName?: string;
  phone?: string;
  taxId?: string;
  useCase?: string;
  provisionSource?: string;
};

export type CheckoutProvisionResult = {
  companyId: string;
  isNewCompany: boolean;
  identityReviewRequired: boolean;
};

type CompanyRow = {
  id: string;
  name: string;
  rut: string | null;
  billing_email: string | null;
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

function checkoutProvisionLockKey(orderId: string): string {
  return `checkout-provision:${orderId}`;
}

async function companyWalletActivityScore(companyId: string): Promise<number> {
  const wallet = await getOrCreateCompanyWallet(companyId, "CL");
  return (
    Number(wallet.available_sms ?? 0) +
    Number(wallet.total_purchased_sms ?? 0) +
    Number(wallet.consumed_sms ?? 0)
  );
}

async function countCompanyOrders(companyId: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("sms_orders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (error) {
    wrapSupabaseError(error, "provision.countCompanyOrders");
  }
  return count ?? 0;
}

async function orderLinkedToCompany(
  orderId: string,
  companyId: string,
): Promise<boolean> {
  const { count, error } = await getSupabase()
    .from("sms_orders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("id", orderId);
  if (error) {
    wrapSupabaseError(error, "provision.orderLinkedToCompany");
  }
  return (count ?? 0) > 0;
}

/** Elige la empresa con compras/saldo; evita enlazar a la huérfana creada primero en carrera MP. */
async function resolveBestCompanyForBillingEmail(
  email: string,
  orderId: string,
): Promise<CompanyRow | null> {
  const sb = getSupabase();
  const { data: companies, error } = await sb
    .from("companies")
    .select("id, name, rut, billing_email, created_at")
    .ilike("billing_email", email)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) {
    wrapSupabaseError(error, "provision.findCompaniesByEmail");
  }
  if (!companies?.length) {
    return null;
  }
  if (companies.length === 1) {
    return companies[0] as CompanyRow;
  }

  let best = companies[0] as CompanyRow;
  let bestScore = -1;
  for (const company of companies) {
    let score = 0;
    if (await orderLinkedToCompany(orderId, company.id)) {
      score += 10_000;
    }
    score += (await countCompanyOrders(company.id)) * 100;
    score += await companyWalletActivityScore(company.id);
    if (score > bestScore) {
      bestScore = score;
      best = company as CompanyRow;
    }
  }
  return best;
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

function applyIdentityReviewFlags(
  existing: { name: string; rut: string | null },
  submittedRut: string | null,
  submittedCompanyName: string | null,
): boolean {
  const existingRut = normalizeRut(existing.rut);
  if (submittedRut && existingRut && submittedRut !== existingRut) {
    return true;
  }
  if (companyNameDiffers(existing.name, submittedCompanyName)) {
    return true;
  }
  return false;
}

async function countProfilesForCompany(companyId: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (error) {
    wrapSupabaseError(error, "provision.countProfilesForCompany");
  }
  return count ?? 0;
}

/** Elimina empresas checkout duplicadas sin órdenes, saldo ni perfiles (best-effort). */
export async function archiveCheckoutDuplicateOrphans(
  email: string,
  keepCompanyId: string,
): Promise<number> {
  const normalized = normalizeEmail(email);
  const sb = getSupabase();
  const { data: companies, error } = await sb
    .from("companies")
    .select("id, status")
    .ilike("billing_email", normalized)
    .neq("id", keepCompanyId);
  if (error) {
    wrapSupabaseError(error, "provision.archiveDuplicates.select");
  }

  let removed = 0;
  for (const row of companies ?? []) {
    const companyId = String(row.id);
    const orderCount = await countCompanyOrders(companyId);
    if (orderCount > 0) continue;
    const walletScore = await companyWalletActivityScore(companyId);
    if (walletScore > 0) continue;
    const profileCount = await countProfilesForCompany(companyId);
    if (profileCount > 0) continue;

    const { error: delErr } = await sb.from("companies").delete().eq("id", companyId);
    if (delErr) {
      console.warn("[provision] delete duplicate orphan failed", companyId, delErr.message);
      continue;
    }
    removed += 1;
    console.info("[provision] deleted duplicate orphan company", {
      email: normalized,
      orphanId: companyId,
      keepCompanyId,
      previousStatus: row.status,
    });
  }
  return removed;
}

async function provisionCompanyFromCheckoutUnlocked(
  input: CheckoutProvisionInput,
): Promise<CheckoutProvisionResult> {
  const freshOrder = await getOrderById(input.order.id);
  if (!freshOrder) {
    throw new Error("provision_order_not_found");
  }
  if (freshOrder.company_id) {
    await linkSimActivationToCompany(freshOrder.id, freshOrder.company_id);
    return {
      companyId: freshOrder.company_id,
      isNewCompany: false,
      identityReviewRequired:
        freshOrder.metadata?.identity_review_required === true,
    };
  }

  const email = normalizeEmail(input.checkoutEmail);
  const submittedRut = normalizeRut(input.taxId);
  const submittedCompanyName =
    input.companyName?.trim() || input.payerName?.trim() || null;

  let companyId: string | null = null;
  let isNewCompany = false;
  let identityReviewRequired = false;

  const bestByEmail = await resolveBestCompanyForBillingEmail(
    email,
    input.order.id,
  );
  const profileCompanyId = await findCompanyByProfileEmail(email);

  if (bestByEmail?.id) {
    companyId = bestByEmail.id;
    identityReviewRequired = applyIdentityReviewFlags(
      bestByEmail,
      submittedRut,
      submittedCompanyName,
    );
  } else if (profileCompanyId) {
    companyId = profileCompanyId;
    const existing = await loadCompany(profileCompanyId);
    if (existing) {
      identityReviewRequired = applyIdentityReviewFlags(
        existing,
        submittedRut,
        submittedCompanyName,
      );
    }
  }

  const sb = getSupabase();

  if (!companyId) {
    const displayName =
      submittedCompanyName ||
      input.payerName?.trim() ||
      email.split("@")[0] ||
      "Cliente Telvoice";
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
          source: input.provisionSource ?? "landing_sim_agent_builder",
          first_order_id: input.order.id,
          account_creation_mode: "post_payment_auto",
        },
      })
      .select("id")
      .single();

    if (compErr) {
      if (isDuplicateKeyError(compErr)) {
        const resolved = await resolveBestCompanyForBillingEmail(
          email,
          input.order.id,
        );
        if (!resolved?.id) {
          wrapSupabaseError(compErr, "provision.company.insert");
        }
        companyId = resolved!.id;
        isNewCompany = false;
        identityReviewRequired = applyIdentityReviewFlags(
          resolved!,
          submittedRut,
          submittedCompanyName,
        );
      } else {
        wrapSupabaseError(compErr, "provision.company.insert");
      }
    } else {
      companyId = company?.id ?? null;
      isNewCompany = true;
    }
  }

  if (!companyId) {
    throw new Error("provision_company_failed");
  }

  await getOrCreateCompanyWallet(companyId, "CL");

  const nowIso = new Date().toISOString();
  const orderMeta = freshOrder.metadata ?? {};

  await patchOrderFields(freshOrder.id, {
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

  await linkSimActivationToCompany(freshOrder.id, companyId);

  try {
    await archiveCheckoutDuplicateOrphans(email, companyId);
  } catch (archiveErr) {
    console.warn("[provision] archive duplicates best-effort failed", archiveErr);
  }

  return { companyId, isNewCompany, identityReviewRequired };
}

export async function provisionCompanyFromCheckout(
  input: CheckoutProvisionInput,
): Promise<CheckoutProvisionResult> {
  if (input.order.company_id) {
    await linkSimActivationToCompany(input.order.id, input.order.company_id);
    return {
      companyId: input.order.company_id,
      isNewCompany: false,
      identityReviewRequired: input.order.metadata?.identity_review_required === true,
    };
  }

  return withPgAdvisoryLock(checkoutProvisionLockKey(input.order.id), () =>
    provisionCompanyFromCheckoutUnlocked(input),
  );
}
