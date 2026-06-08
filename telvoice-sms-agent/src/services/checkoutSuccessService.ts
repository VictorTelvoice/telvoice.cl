import { env } from "../config/env.js";
import { buildPanelLoginUrl } from "./checkoutAccessEmailService.js";
import type { SmsOrderRow, SmsOrderWithDetails } from "../types/wallet.js";
import { decryptClaimTokenFromMetadata } from "../utils/claim-token.js";
import { buildClaimActivationUrl } from "../utils/claim-token.js";
import { isPublicCheckoutOrder, isSimAgentBundleOrder, isSimSubscriptionOrder } from "../utils/order-display.js";
import {
  getOrderById,
  getOrderByMercadoPagoPaymentId,
  getOrderByPublicCheckoutReference,
  getOrderWithDetails,
} from "./smsOrderService.js";
import { toPublicOrderSummary, type PublicOrderSummary } from "../utils/public-order-summary.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckoutSuccessPageData = {
  summary: PublicOrderSummary | null;
  mpStatus: string;
  mpPaymentId: string | null;
  publicCheckoutRef: string | null;
  claimUrl: string | null;
  activationHint: "claim_button" | "check_email" | "panel";
  /** MP aprobó pero la orden aún no se resuelve en BD (webhook en curso). */
  confirmingPayment: boolean;
  publicSiteUrl: string;
  appUrl: string;
  isSimSubscription: boolean;
  isSimAgentBundle: boolean;
  planName: string | null;
  agentPlanName: string | null;
  bundleSummary: string | null;
  activationStatus: string | null;
  panelLoginUrl: string;
};

function pickQueryString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

export function parseCheckoutSuccessQuery(query: Record<string, unknown>): {
  ref: string;
  externalReference: string;
  paymentId: string;
  mpStatus: string;
} {
  const mpStatus = (
    pickQueryString(query.collection_status) ||
    pickQueryString(query.status) ||
    ""
  ).toLowerCase();

  return {
    ref: pickQueryString(query.ref),
    externalReference: pickQueryString(query.external_reference),
    paymentId: pickQueryString(query.payment_id) || pickQueryString(query.collection_id),
    mpStatus,
  };
}

export async function resolveCheckoutSuccessOrder(input: {
  ref: string;
  externalReference: string;
  paymentId: string;
}): Promise<SmsOrderWithDetails | null> {
  if (input.ref) {
    const byRef = await getOrderByPublicCheckoutReference(input.ref);
    if (byRef) {
      return getOrderWithDetails(byRef.id);
    }
  }

  if (input.externalReference && UUID_RE.test(input.externalReference)) {
    const byId = await getOrderById(input.externalReference);
    if (byId) {
      return getOrderWithDetails(byId.id);
    }
  }

  if (input.paymentId) {
    const byPayment = await getOrderByMercadoPagoPaymentId(input.paymentId);
    if (byPayment) {
      return getOrderWithDetails(byPayment.id);
    }
  }

  return null;
}

function resolveClaimUrl(order: SmsOrderRow): string | null {
  if (order.claim_status && order.claim_status !== "unclaimed") {
    return null;
  }
  const enc = order.metadata?.claim_token_enc;
  if (typeof enc !== "string" || !enc.length) {
    return null;
  }
  const token = decryptClaimTokenFromMetadata(enc);
  if (!token) {
    return null;
  }
  return buildClaimActivationUrl(token);
}

export async function buildCheckoutSuccessPageData(
  query: Record<string, unknown>,
): Promise<CheckoutSuccessPageData> {
  const parsed = parseCheckoutSuccessQuery(query);
  const order = await resolveCheckoutSuccessOrder(parsed);

  const mpPaymentId =
    parsed.paymentId ||
    (order ? toPublicOrderSummary(order).mpPaymentId : null);

  let summary: PublicOrderSummary | null = null;
  let claimUrl: string | null = null;
  let activationHint: CheckoutSuccessPageData["activationHint"] = "check_email";

  if (order && isPublicCheckoutOrder(order)) {
    summary = toPublicOrderSummary(order);
    claimUrl = isSimAgentBundleOrder(order) ? null : resolveClaimUrl(order);
    if (isSimAgentBundleOrder(order)) {
      activationHint = "panel";
    } else if (order.claim_status === "claimed" || order.credit_status === "credited") {
      activationHint = "panel";
    } else if (claimUrl) {
      activationHint = "claim_button";
    } else {
      activationHint = "check_email";
    }
  } else if (order) {
    summary = toPublicOrderSummary(order);
    activationHint = "panel";
  }

  const mpApproved =
    parsed.mpStatus === "approved" || parsed.mpStatus === "accredited";
  const confirmingPayment = !order && mpApproved;

  const isSimSubscription = order ? isSimSubscriptionOrder(order) : false;
  const isSimAgentBundle = order ? isSimAgentBundleOrder(order) : false;
  const planName =
    order && typeof order.metadata?.sim_plan_name === "string"
      ? order.metadata.sim_plan_name
      : order && typeof order.metadata?.plan_name === "string"
        ? order.metadata.plan_name
        : null;
  const agentPlanName =
    order && typeof order.metadata?.agent_addon_name === "string" &&
    order.metadata?.agent_addon_id !== "none"
      ? order.metadata.agent_addon_name
      : null;
  const bundleSummary =
    planName && agentPlanName
      ? `${planName} + ${agentPlanName}`
      : planName;
  const activationStatus =
    order && typeof order.metadata?.activation_status === "string"
      ? order.metadata.activation_status
      : null;
  const panelLoginUrl = buildPanelLoginUrl(summary?.customerEmail ?? order?.checkout_email ?? undefined);

  return {
    summary,
    mpStatus: parsed.mpStatus,
    mpPaymentId,
    publicCheckoutRef: parsed.ref || summary?.orderRef || null,
    claimUrl,
    activationHint,
    confirmingPayment,
    publicSiteUrl: env.publicSiteUrl,
    appUrl: env.publicAppUrl,
    isSimSubscription,
    isSimAgentBundle,
    planName,
    agentPlanName,
    bundleSummary,
    activationStatus,
    panelLoginUrl,
  };
}
