export type SmsProductType = "sms_bundle" | "custom_quote";

export type PublicLeadSource = "telegram_agent" | "landing_agent";

export type PublicLeadStatus = "new" | "contacted" | "closed";

export interface SmsProductRow {
  id: string;
  country_code: string;
  country_name: string;
  product_name: string;
  description: string | null;
  sms_quantity: number;
  currency: string;
  price_amount: number;
  unit_price: number;
  checkout_url: string | null;
  is_featured: boolean;
  is_active: boolean;
  product_type: SmsProductType;
  created_at: string;
  updated_at: string;
}

export interface CreateSmsProductInput {
  country_code?: string;
  country_name?: string;
  product_name: string;
  description?: string | null;
  sms_quantity: number;
  currency?: string;
  price_amount: number;
  unit_price: number;
  checkout_url?: string | null;
  is_featured?: boolean;
  is_active?: boolean;
  product_type?: SmsProductType;
}

export interface UpdateSmsProductInput {
  country_code?: string;
  country_name?: string;
  product_name?: string;
  description?: string | null;
  sms_quantity?: number;
  currency?: string;
  price_amount?: number;
  unit_price?: number;
  checkout_url?: string | null;
  is_featured?: boolean;
  is_active?: boolean;
  product_type?: SmsProductType;
}

export interface PublicLeadRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  country: string;
  message: string | null;
  requested_quantity: number | null;
  source: PublicLeadSource;
  status: PublicLeadStatus;
  created_at: string;
}

export interface CreatePublicLeadInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  country?: string;
  message?: string | null;
  requested_quantity?: number | null;
  source?: PublicLeadSource;
}

export interface SmsPricingTierRow {
  id: string;
  country_code: string;
  min_quantity: number;
  unit_price: number;
  currency: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CommercialQuoteResult {
  country_code: string;
  /** Cantidad ingresada por el usuario */
  requested_quantity: number;
  /** Cantidad cotizada (múltiplo de 1.000) */
  quoted_quantity: number;
  /** @deprecated alias de quoted_quantity */
  quantity: number;
  quote_type: "calculator" | "high_volume";
  product: SmsProductRow | null;
  unit_price: number;
  tier_label: string;
  was_rounded: boolean;
  subtotal: number;
  iva: number;
  total_with_iva: number;
  currency: string;
  checkout_url: string | null;
  commercial_message: string;
  includes: string[];
}
