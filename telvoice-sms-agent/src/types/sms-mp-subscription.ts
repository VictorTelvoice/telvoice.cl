export type SmsMpSubscriptionStatus =
  | "pending"
  | "authorized"
  | "paused"
  | "cancelled";

/** Suscripción mensual Mercado Pago (bolsa calculadora) — guardada en companies.metadata.sms_mp_subscription */
export type CompanySmsMpSubscription = {
  id: string;
  status: SmsMpSubscriptionStatus;
  packageId: string;
  smsQuantity: number;
  monthlyAmount: number;
  currency: string;
  mpPreapprovalId: string | null;
  mpInitPoint: string | null;
  createdAt: string;
  authorizedAt: string | null;
  cancelledAt: string | null;
  lastPaymentAt: string | null;
  lastOrderId: string | null;
};

export const SMS_MP_SUBSCRIPTION_META_KEY = "sms_mp_subscription";
