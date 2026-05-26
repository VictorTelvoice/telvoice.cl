/** Modo de cobro configurado en panel cliente. */
export type PaymentBillingMode = "recurring" | "on_demand";

export interface CompanyPaymentCardConfig {
  configured: boolean;
  holderName?: string;
  brand?: string;
  lastFour?: string;
  expiryMonth?: string;
  expiryYear?: string;
  billingMode: PaymentBillingMode;
  autoRechargeEnabled: boolean;
  defaultPackageId?: string | null;
  linkedAt?: string;
  mercadopagoPaymentMethodId?: string | null;
}

export const DEFAULT_PAYMENT_CARD_CONFIG: CompanyPaymentCardConfig = {
  configured: false,
  billingMode: "on_demand",
  autoRechargeEnabled: false,
  defaultPackageId: null,
};
