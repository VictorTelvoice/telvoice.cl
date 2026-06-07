import { randomUUID } from "node:crypto";
import { getSupabase } from "../database/supabaseClient.js";
import { invalidateAppContextCache } from "./appContextCache.js";
import {
  SMS_MP_SUBSCRIPTION_META_KEY,
  type CompanySmsMpSubscription,
  type SmsMpSubscriptionStatus,
} from "../types/sms-mp-subscription.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function parseSmsMpSubscription(
  metadata: Record<string, unknown> | null | undefined,
): CompanySmsMpSubscription | null {
  const raw = asRecord(metadata?.[SMS_MP_SUBSCRIPTION_META_KEY]);
  const id = str(raw.id);
  if (!id) {
    return null;
  }
  const statusRaw = str(raw.status);
  const status: SmsMpSubscriptionStatus =
    statusRaw === "authorized" ||
    statusRaw === "paused" ||
    statusRaw === "cancelled"
      ? statusRaw
      : "pending";

  return {
    id,
    status,
    packageId: str(raw.packageId) ?? "",
    smsQuantity: num(raw.smsQuantity) ?? 0,
    monthlyAmount: num(raw.monthlyAmount) ?? 0,
    currency: str(raw.currency) ?? "CLP",
    mpPreapprovalId: str(raw.mpPreapprovalId) ?? null,
    mpInitPoint: str(raw.mpInitPoint) ?? null,
    createdAt: str(raw.createdAt) ?? new Date(0).toISOString(),
    authorizedAt: str(raw.authorizedAt) ?? null,
    cancelledAt: str(raw.cancelledAt) ?? null,
    lastPaymentAt: str(raw.lastPaymentAt) ?? null,
    lastOrderId: str(raw.lastOrderId) ?? null,
  };
}

async function readCompanyMetadata(
  companyId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase()
    .from("companies")
    .select("metadata")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    wrapSupabaseError(error, "smsMpSubscription.read");
  }
  return asRecord((data as { metadata?: unknown } | null)?.metadata);
}

async function writeSubscription(
  companyId: string,
  subscription: CompanySmsMpSubscription,
): Promise<CompanySmsMpSubscription> {
  const metadata = await readCompanyMetadata(companyId);
  const next = {
    ...metadata,
    [SMS_MP_SUBSCRIPTION_META_KEY]: subscription,
  };
  const { error } = await getSupabase()
    .from("companies")
    .update({ metadata: next })
    .eq("id", companyId);
  if (error) {
    wrapSupabaseError(error, "smsMpSubscription.write");
  }
  invalidateAppContextCache(companyId);
  return subscription;
}

export async function getCompanySmsMpSubscription(
  companyId: string,
): Promise<CompanySmsMpSubscription | null> {
  const metadata = await readCompanyMetadata(companyId);
  return parseSmsMpSubscription(metadata);
}

export async function createPendingSmsMpSubscription(input: {
  companyId: string;
  packageId: string;
  smsQuantity: number;
  monthlyAmount: number;
  currency?: string;
}): Promise<CompanySmsMpSubscription> {
  const existing = await getCompanySmsMpSubscription(input.companyId);
  if (existing?.status === "authorized") {
    throw new Error(
      "Ya tienes una suscripción mensual activa. Cancélala antes de crear otra.",
    );
  }

  const subscription: CompanySmsMpSubscription = {
    id: randomUUID(),
    status: "pending",
    packageId: input.packageId,
    smsQuantity: input.smsQuantity,
    monthlyAmount: Math.round(input.monthlyAmount),
    currency: input.currency ?? "CLP",
    mpPreapprovalId: null,
    mpInitPoint: null,
    createdAt: new Date().toISOString(),
    authorizedAt: null,
    cancelledAt: null,
    lastPaymentAt: null,
    lastOrderId: null,
  };

  return writeSubscription(input.companyId, subscription);
}

export async function attachPreapprovalToSubscription(input: {
  companyId: string;
  subscriptionId: string;
  mpPreapprovalId: string;
  mpInitPoint: string | null;
}): Promise<CompanySmsMpSubscription | null> {
  const current = await getCompanySmsMpSubscription(input.companyId);
  if (!current || current.id !== input.subscriptionId) {
    return null;
  }
  return writeSubscription(input.companyId, {
    ...current,
    mpPreapprovalId: input.mpPreapprovalId,
    mpInitPoint: input.mpInitPoint,
  });
}

export async function updateSmsMpSubscriptionStatus(input: {
  companyId: string;
  subscriptionId: string;
  status: SmsMpSubscriptionStatus;
  mpPreapprovalId?: string | null;
}): Promise<CompanySmsMpSubscription | null> {
  const current = await getCompanySmsMpSubscription(input.companyId);
  if (!current || current.id !== input.subscriptionId) {
    return null;
  }
  const now = new Date().toISOString();
  return writeSubscription(input.companyId, {
    ...current,
    status: input.status,
    mpPreapprovalId: input.mpPreapprovalId ?? current.mpPreapprovalId,
    authorizedAt:
      input.status === "authorized" ? current.authorizedAt ?? now : current.authorizedAt,
    cancelledAt:
      input.status === "cancelled" ? now : current.cancelledAt,
  });
}

export async function findSubscriptionByExternalReference(
  externalReference: string,
): Promise<{ companyId: string; subscription: CompanySmsMpSubscription } | null> {
  const ref = externalReference.trim();
  if (!ref) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from("companies")
    .select("id, metadata")
    .not(`metadata->${SMS_MP_SUBSCRIPTION_META_KEY}`, "is", null);

  if (error) {
    wrapSupabaseError(error, "smsMpSubscription.findByRef");
  }

  for (const row of data ?? []) {
    const companyId = str((row as { id?: unknown }).id);
    if (!companyId) {
      continue;
    }
    const sub = parseSmsMpSubscription(
      asRecord((row as { metadata?: unknown }).metadata),
    );
    if (sub?.id === ref) {
      return { companyId, subscription: sub };
    }
  }

  return null;
}

export async function findSubscriptionByPreapprovalId(
  preapprovalId: string,
): Promise<{ companyId: string; subscription: CompanySmsMpSubscription } | null> {
  const id = preapprovalId.trim();
  if (!id) {
    return null;
  }

  const { data, error } = await getSupabase().from("companies").select("id, metadata");
  if (error) {
    wrapSupabaseError(error, "smsMpSubscription.findByPreapproval");
  }

  for (const row of data ?? []) {
    const companyId = str((row as { id?: unknown }).id);
    if (!companyId) {
      continue;
    }
    const sub = parseSmsMpSubscription(
      asRecord((row as { metadata?: unknown }).metadata),
    );
    if (sub?.mpPreapprovalId === id) {
      return { companyId, subscription: sub };
    }
  }

  return null;
}

export async function recordSubscriptionPayment(input: {
  companyId: string;
  subscriptionId: string;
  orderId: string;
}): Promise<void> {
  const current = await getCompanySmsMpSubscription(input.companyId);
  if (!current || current.id !== input.subscriptionId) {
    return;
  }
  await writeSubscription(input.companyId, {
    ...current,
    status: "authorized",
    authorizedAt: current.authorizedAt ?? new Date().toISOString(),
    lastPaymentAt: new Date().toISOString(),
    lastOrderId: input.orderId,
  });
}
