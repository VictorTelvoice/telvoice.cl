import { env } from "../config/env.js";
import type { CompanyRow } from "../types/tenant.js";
import type { UserProfileContext } from "../types/tenant.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { AppError } from "../utils/errors.js";
import { isSimSubscriptionOrder } from "../utils/order-display.js";
import {
  buildSimPlanDefinitionFromSettings,
  calculatePlanIntroPromo,
  calculateSimPlanPrice,
  getSimPlanById,
  type SimBillingCycle,
} from "./simPlanSettingsService.js";
import { isSimPlanId } from "../utils/simPlans.js";
import { resolveSimSubscriptionCheckoutPricing, inventorySuffixFromE164 } from "../utils/simTestPricing.js";
import { inventoryPublicId } from "../utils/inventory-public-id.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMercadoPagoConfigured } from "../config/env.js";
import {
  createClientPanelSimSubscriptionPreapproval,
} from "./mercadoPagoService.js";
import { listPublicSimAvailableNumbers } from "./publicCheckoutService.js";
import {
  ensureSimInventoryHeldForPendingOrder,
  getInventoryById,
  getPublicAvailability,
  maskE164ChileMobile,
  passesPublicInventoryListingFilter,
  releaseExpiredSimCheckoutHoldsBestEffort,
  releaseReservationForOrder,
  reserveAvailableNumberForCheckout,
  resolvePublicInventoryId,
} from "./realNumberInventoryService.js";
import {
  createClientPanelSimOrder,
  patchOrderFields,
} from "./smsOrderService.js";
import {
  attachPreapprovalToSimSubscription,
  createPendingSimSubscription,
  updateSimSubscriptionStatus,
} from "./simSubscriptionService.js";
import { scheduleSimSubscriptionPriceChange } from "./simSubscriptionScheduledPriceService.js";
import {
  computeSimCheckoutPricingForContext,
  formatResolvedPricingForApi,
  inventorySuffixForPendingOrder,
  isSimPendingOrderPricingStale,
  resolveSimPendingCheckoutBeforeStart,
  supersedeSimPendingCheckoutOrder,
  type SimPendingPricingContext,
  type SimResolvedPricingApi,
} from "./simPendingCheckoutPricingService.js";
import {
  linkSimActivationInventory,
  linkSimActivationToCompany,
} from "./simActivationService.js";

export type ClientSimSubscriptionCheckoutResult = {
  orderId: string;
  checkoutUrl: string;
  preferenceId: string | null;
  productType: "sim_subscription";
};

export type ClientPendingSimCheckoutResult = {
  has_pending_order: boolean;
  order_id?: string;
  amount?: number;
  payment_url?: string;
  selected_number?: string;
  expires_at?: string;
  reservation_expired?: boolean;
  plan_id?: string;
  billing_cycle?: SimBillingCycle;
  pricing_stale?: boolean;
  expected_amount?: number;
  resolved_pricing?: SimResolvedPricingApi;
};

function orderPaymentUrl(order: SmsOrderRow): string | null {
  const meta = order.metadata ?? {};
  const url =
    typeof meta.mercadopago_init_point === "string"
      ? meta.mercadopago_init_point.trim()
      : "";
  return url || null;
}

function resolveCheckoutEmail(
  profile: UserProfileContext,
  company: CompanyRow,
): string {
  const fromProfile = profile.email.trim().toLowerCase();
  if (fromProfile.includes("@")) return fromProfile;
  const billing = company.billing_email?.trim().toLowerCase() ?? "";
  if (billing.includes("@")) return billing;
  throw new AppError(
    "No hay un correo válido asociado a tu cuenta.",
    400,
    "VALIDATION_ERROR",
  );
}

function resolvePayerName(profile: UserProfileContext, company: CompanyRow): string {
  const name = profile.fullName.trim() || company.contact_name?.trim() || company.name.trim();
  if (name.length >= 2) return name;
  return "Cliente Telvoice";
}

export async function getClientPendingSimCheckoutForCompany(
  companyId: string,
  pricingContext?: SimPendingPricingContext,
): Promise<ClientPendingSimCheckoutResult> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("sms_orders")
    .select("*")
    .eq("company_id", companyId)
    .eq("payment_status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw wrapSupabaseError(error, "getClientPendingSimCheckoutForCompany");
  }

  const order = (data ?? [])
    .map((row) => row as SmsOrderRow)
    .find((row) => {
      if (!isSimSubscriptionOrder(row)) return false;
      if (!pricingContext?.planId) return true;
      const meta = row.metadata ?? {};
      const orderPlanId =
        typeof meta.plan_id === "string" ? meta.plan_id.trim() : "";
      return !orderPlanId || orderPlanId === pricingContext.planId;
    });

  let resolvedPricing: SimResolvedPricingApi | undefined;
  if (pricingContext) {
    const pricing = await computeSimCheckoutPricingForContext(pricingContext);
    if (pricing) {
      resolvedPricing = formatResolvedPricingForApi(
        pricingContext.planId,
        pricingContext.billingCycle,
        pricing,
      );
    }
  }

  if (!order) {
    return { has_pending_order: false, resolved_pricing: resolvedPricing };
  }

  const meta = order.metadata ?? {};
  const inventoryId =
    typeof meta.inventory_number_id === "string" ? meta.inventory_number_id : null;

  let selectedNumber =
    typeof meta.selected_number_masked === "string"
      ? meta.selected_number_masked
      : undefined;
  let expiresAt: string | undefined;
  let reservationExpired = false;

  if (inventoryId) {
    const hold = await ensureSimInventoryHeldForPendingOrder({
      orderId: order.id,
      inventoryId,
    });

    const { data: invRow } = await sb
      .from("real_number_inventory")
      .select("e164_number, reserved_until, sales_status, current_order_id")
      .eq("id", inventoryId)
      .maybeSingle();

    if (invRow) {
      if (!selectedNumber && invRow.e164_number) {
        selectedNumber = maskE164ChileMobile(String(invRow.e164_number));
      }
      if (invRow.reserved_until) {
        expiresAt = String(invRow.reserved_until);
      } else if (hold.expiresAt) {
        expiresAt = hold.expiresAt;
      }
      reservationExpired =
        !hold.held ||
        invRow.current_order_id !== order.id ||
        invRow.sales_status !== "reserved_pending_payment" ||
        (expiresAt != null && new Date(expiresAt).getTime() <= Date.now());
    } else {
      reservationExpired = true;
    }
  }

  const paymentUrl = orderPaymentUrl(order);
  const billingCycle: SimBillingCycle =
    meta.billing_cycle === "annual" ? "annual" : "monthly";

  let pricingStale = false;
  let expectedAmount: number | undefined;
  if (pricingContext) {
    const suffix = await inventorySuffixForPendingOrder(order);
    const pricing = await computeSimCheckoutPricingForContext({
      ...pricingContext,
      inventorySuffix: pricingContext.inventorySuffix ?? suffix,
    });
    if (pricing) {
      expectedAmount = pricing.totalAmount;
      resolvedPricing = formatResolvedPricingForApi(
        pricingContext.planId,
        pricingContext.billingCycle,
        pricing,
      );
      pricingStale = isSimPendingOrderPricingStale(order, {
        planId: pricingContext.planId,
        billingCycle: pricingContext.billingCycle,
        totalAmount: pricing.totalAmount,
        priceMetadata: pricing.priceMetadata,
      });
    }
  }

  if (pricingStale) {
    await supersedeSimPendingCheckoutOrder(order.id, "pricing_mismatch");
    return {
      has_pending_order: false,
      resolved_pricing: resolvedPricing,
    };
  }

  return {
    has_pending_order: true,
    order_id: order.id,
    amount: Math.round(Number(order.amount)),
    payment_url: paymentUrl ?? undefined,
    selected_number: selectedNumber,
    expires_at: expiresAt,
    reservation_expired: reservationExpired,
    plan_id: typeof meta.plan_id === "string" ? meta.plan_id : undefined,
    billing_cycle: billingCycle,
    pricing_stale: false,
    expected_amount: expectedAmount,
    resolved_pricing: resolvedPricing,
  };
}

export async function listClientSimAvailableNumbers() {
  return listPublicSimAvailableNumbers();
}

export async function startClientPanelSimSubscriptionCheckout(input: {
  company: CompanyRow;
  profile: UserProfileContext;
  planId: string;
  billingCycle?: SimBillingCycle;
  assignmentMode?: "selected" | "auto";
  inventoryPublicId?: string;
}): Promise<ClientSimSubscriptionCheckoutResult> {
  if (!isMercadoPagoConfigured()) {
    throw new AppError(
      "La suscripción mensual está en preparación. Contáctanos para activar tu numeración.",
      503,
      "SUBSCRIPTION_NOT_READY",
    );
  }

  const assignmentMode: "selected" | "auto" =
    input.assignmentMode === "auto" ? "auto" : "selected";
  const requestedInventoryPublicId = input.inventoryPublicId?.trim() ?? "";

  if (assignmentMode === "selected" && !requestedInventoryPublicId) {
    throw new AppError(
      "Elige una numeración disponible para continuar.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const checkoutEmail = resolveCheckoutEmail(input.profile, input.company);
  const payerName = resolvePayerName(input.profile, input.company);

  if (!isSimPlanId(input.planId)) {
    throw new AppError("plan_id SIM no válido.", 400, "INVALID_SIM_PLAN");
  }

  const billingCycle: SimBillingCycle =
    input.billingCycle === "annual" ? "annual" : "monthly";

  const planSettings = await getSimPlanById(input.planId);
  if (!planSettings) {
    throw new AppError("Plan SIM no encontrado.", 404);
  }

  if (planSettings.plan_id === "custom") {
    throw new AppError(
      "El plan a medida requiere cotización comercial.",
      400,
      "CUSTOM_PLAN_NO_CHECKOUT",
    );
  }

  if (billingCycle === "annual" && !planSettings.annual_enabled) {
    throw new AppError(
      "El ciclo anual no está habilitado para este plan.",
      400,
      "ANNUAL_NOT_ENABLED",
    );
  }

  const plan = buildSimPlanDefinitionFromSettings(planSettings);
  if (!plan) {
    throw new AppError("Plan SIM no encontrado.", 404);
  }

  const configuredPricing = calculateSimPlanPrice(planSettings, billingCycle);
  const introPromo =
    billingCycle === "monthly" ? calculatePlanIntroPromo(planSettings) : null;

  const pending = await getClientPendingSimCheckoutForCompany(input.company.id, {
    planId: input.planId,
    billingCycle,
    checkoutEmail,
  });

  const pricingPreview = resolveSimSubscriptionCheckoutPricing(
    plan,
    checkoutEmail,
    "",
    {
      billingCycle,
      configuredMonthlyClp: configuredPricing.monthly_price_clp,
      annualDiscountPercent: configuredPricing.annual_discount_percent,
      planIntroPromo: introPromo?.hasIntroPromo ? introPromo : undefined,
    },
  );

  const pendingResolution = await resolveSimPendingCheckoutBeforeStart({
    pendingOrderId: pending.order_id,
    reservationExpired: pending.reservation_expired,
    paymentUrl: pending.payment_url,
    expected: {
      planId: input.planId,
      billingCycle,
      totalAmount: pricingPreview.totalAmount,
      priceMetadata: pricingPreview.priceMetadata,
    },
  });

  if (pendingResolution.reuseExisting) {
    throw new AppError(
      "Ya tienes una suscripción SIM pendiente de pago. Continúa el pago existente o espera a que expire la reserva.",
      409,
      "PENDING_ORDER_EXISTS",
      {
        payment_url: pendingResolution.paymentUrl,
        order_id: pendingResolution.orderId,
      },
    );
  }

  await releaseExpiredSimCheckoutHoldsBestEffort();

  const availability = await getPublicAvailability();
  if (!availability.in_stock) {
    throw new AppError(
      "No hay numeraciones disponibles en este momento.",
      409,
      "NO_STOCK",
    );
  }

  let resolvedInventoryId: string | null = null;
  let inventoryRow: Awaited<ReturnType<typeof getInventoryById>> = null;

  if (assignmentMode === "selected") {
    resolvedInventoryId =
      (await resolvePublicInventoryId(requestedInventoryPublicId)) ?? null;
    if (!resolvedInventoryId) {
      throw new AppError(
        "Esta numeración ya no está disponible. Elige otra numeración.",
        409,
        "NUMBER_UNAVAILABLE",
      );
    }

    inventoryRow = await getInventoryById(resolvedInventoryId);
    if (!inventoryRow) {
      throw new AppError(
        "Esta numeración ya no está disponible. Elige otra numeración.",
        409,
        "NUMBER_UNAVAILABLE",
      );
    }

    if (!passesPublicInventoryListingFilter(inventoryRow.metadata)) {
      throw new AppError(
        "Esta numeración no está disponible para suscripción.",
        409,
        "NUMBER_UNAVAILABLE",
      );
    }
  }

  const inventorySuffix = inventoryRow
    ? inventorySuffixFromE164(inventoryRow.e164_number)
    : "";
  const pricing = resolveSimSubscriptionCheckoutPricing(
    plan,
    checkoutEmail,
    inventorySuffix,
    {
      billingCycle,
      configuredMonthlyClp: configuredPricing.monthly_price_clp,
      annualDiscountPercent: configuredPricing.annual_discount_percent,
      planIntroPromo: introPromo?.hasIntroPromo ? introPromo : undefined,
    },
  );

  const order = await createClientPanelSimOrder({
    companyId: input.company.id,
    createdBy: input.profile.profileId,
    plan,
    checkoutEmail,
    payerEmail: checkoutEmail,
    payerName,
    companyName: input.company.name,
    phone: input.company.contact_phone ?? undefined,
    taxId: input.company.rut ?? undefined,
    checkoutTotalAmount: pricing.totalAmount,
    priceMetadata: {
      ...pricing.priceMetadata,
      source: "client_panel_sim_subscription",
      plan_id: input.planId,
      billing_cycle: billingCycle,
      billing_mode: "subscription",
      recurring: true,
      checkout_mode: "mercadopago_subscription",
      subscription_status: "pending",
      included_sms: planSettings.included_sms,
      includes_outbound_sms: planSettings.includes_outbound_sms,
      monthly_price_clp: configuredPricing.monthly_price_clp,
      regular_monthly_price_clp: configuredPricing.monthly_price_clp,
      annual_discount_percent: configuredPricing.annual_discount_percent,
      annual_price_clp: configuredPricing.annual_price_clp,
      charge_amount_clp: pricing.totalAmount,
      transaction_amount_clp: pricing.totalAmount,
    },
  });

  await linkSimActivationToCompany(order.id, input.company.id);

  let inventoryNumberId: string;
  try {
    const reserved = await reserveAvailableNumberForCheckout({
      orderId: order.id,
      inventoryId:
        assignmentMode === "selected" ? resolvedInventoryId ?? undefined : undefined,
    });
    inventoryNumberId = reserved.id;
    await linkSimActivationInventory(order.id, inventoryNumberId);

    const digits = reserved.e164_number.replace(/\D/g, "");
    await patchOrderFields(order.id, {
      metadata: {
        ...(order.metadata ?? {}),
        inventory_number_id: inventoryNumberId,
        inventory_public_id: inventoryPublicId(inventoryNumberId),
        selected_number_masked: maskE164ChileMobile(reserved.e164_number),
        number_suffix: digits.slice(-3),
        selected_by_customer: assignmentMode === "selected",
        assignment_mode: assignmentMode,
        reservation_reason: "sim_subscription",
      },
    });
  } catch (err) {
    await patchOrderFields(order.id, {
      payment_status: "cancelled",
      metadata: {
        ...(order.metadata ?? {}),
        checkout_cancel_reason: "inventory_unavailable",
      },
    });
    throw err;
  }

  let simSubscription;
  try {
    simSubscription = await createPendingSimSubscription({
      order,
      plan,
      checkoutEmail,
      inventoryNumberId,
      monthlyAmount:
        billingCycle === "annual"
          ? configuredPricing.monthly_equiv_annual_clp
          : pricing.totalAmount,
      metadata: {
        source: "client_panel_sim_subscription",
        company_id: input.company.id,
        billing_cycle: billingCycle,
        charge_amount_clp: pricing.totalAmount,
      },
    });
  } catch (err) {
    await releaseReservationForOrder(order.id);
    await patchOrderFields(order.id, {
      payment_status: "cancelled",
      metadata: {
        ...(order.metadata ?? {}),
        checkout_cancel_reason: "sim_subscription_record_failed",
      },
    });
    throw err;
  }

  let preapproval;
  try {
    preapproval = await createClientPanelSimSubscriptionPreapproval({
      orderId: order.id,
      companyId: input.company.id,
      plan,
      billingCycle,
      chargeAmount: pricing.totalAmount,
      pricingMetadata: {
        monthly_price_clp: configuredPricing.monthly_price_clp,
        annual_discount_percent: configuredPricing.annual_discount_percent,
        annual_price_clp: configuredPricing.annual_price_clp,
        included_sms: planSettings.included_sms,
        includes_outbound_sms: planSettings.includes_outbound_sms ? 1 : 0,
      },
      payer: {
        email: checkoutEmail,
        name: payerName,
      },
    });
  } catch (err) {
    await releaseReservationForOrder(order.id);
    await updateSimSubscriptionStatus({
      subscriptionId: simSubscription.id,
      status: "cancelled",
      patch: { cancelled_at: new Date().toISOString() },
      metadata: { checkout_cancel_reason: "mp_preapproval_failed" },
    }).catch(() => undefined);
    await patchOrderFields(order.id, {
      payment_status: "cancelled",
      metadata: {
        ...(order.metadata ?? {}),
        checkout_cancel_reason: "mp_preapproval_failed",
      },
    });
    if (err instanceof AppError && err.code === "MP_PREAPPROVAL_FAILED") {
      throw new AppError(
        "No pudimos iniciar la suscripción en MercadoPago. Intenta nuevamente.",
        502,
        "MP_PREAPPROVAL_FAILED",
      );
    }
    throw err;
  }

  await attachPreapprovalToSimSubscription({
    subscriptionId: simSubscription.id,
    preapprovalId: preapproval.preapproval_id ?? "",
  });

  if (
    billingCycle === "monthly" &&
    pricing.priceMetadata.promo_enabled === true &&
    Number(pricing.priceMetadata.promo_duration_months) > 0
  ) {
    const postPromoAmount = Number(pricing.priceMetadata.post_promo_monthly_price_clp);
    await scheduleSimSubscriptionPriceChange({
      orderId: order.id,
      companyId: input.company.id,
      preapprovalId: preapproval.preapproval_id,
      planId: input.planId,
      currentAmountClp: pricing.totalAmount,
      nextAmountClp:
        postPromoAmount > 0 ? postPromoAmount : configuredPricing.monthly_price_clp,
      changeAfterMonths: Number(pricing.priceMetadata.promo_duration_months),
      metadata: {
        promo_source: pricing.priceMetadata.promo_source,
        promo_label: pricing.priceMetadata.promo_label,
      },
    }).catch(() => undefined);
  }

  await patchOrderFields(order.id, {
    payment_reference: preapproval.preapproval_id ?? order.payment_reference,
    metadata: {
      ...(order.metadata ?? {}),
      inventory_number_id: inventoryNumberId,
      inventory_public_id: inventoryPublicId(inventoryNumberId),
      mercadopago_preapproval_id: preapproval.preapproval_id,
      mercadopago_init_point: preapproval.checkout_url,
      subscription_status: "pending",
      sim_subscription_id: simSubscription.id,
    },
  });

  return {
    orderId: order.id,
    checkoutUrl: preapproval.checkout_url,
    preferenceId: preapproval.preapproval_id,
    productType: "sim_subscription",
  };
}

export async function buildClientSimCheckoutProfilePayload(
  company: CompanyRow,
  profile: UserProfileContext,
): Promise<{
  company_name: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  tax_id: string | null;
  support_url: string;
  starter_promo?: {
    monthly_clp: number;
    original_monthly_clp: number;
    duration_months: number;
    expires_at: string;
  };
}> {
  const email = resolveCheckoutEmail(profile, company);
  let starterPromo: Awaited<
    ReturnType<typeof buildClientSimCheckoutProfilePayload>
  >["starter_promo"];

  const pricing = await computeSimCheckoutPricingForContext({
    planId: "sim_starter",
    billingCycle: "monthly",
    checkoutEmail: email,
  });

  if (pricing && pricing.totalAmount < pricing.originalTotalAmount) {
    const meta = pricing.priceMetadata;
    starterPromo = {
      monthly_clp: pricing.totalAmount,
      original_monthly_clp: pricing.originalTotalAmount,
      duration_months: Number(meta.promo_duration_months) || 6,
      expires_at: String(meta.promo_expires_at ?? ""),
    };
  }

  return {
    company_name: company.name,
    email,
    contact_name: profile.fullName.trim() || company.contact_name,
    phone: company.contact_phone,
    tax_id: company.rut,
    support_url: `${env.publicAppUrl}/app/support`,
    ...(starterPromo ? { starter_promo: starterPromo } : {}),
  };
}
