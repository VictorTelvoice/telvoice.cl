import type { WholesaleProviderRow } from "../types/wholesale.js";

/** Código wholesale_providers para PTG Pacific Telecom. */
export const PTG_PACIFIC_PROVIDER_CODE = "ptg_pacific";

/** Valores no secretos para cuenta PTG_2WAY (referencia aSMSC). */
export const PTG_2WAY_ACCOUNT_PRESET: Record<string, string> = {
  label: "PTG_2WAY",
  account_type: "smpp",
  host: "213.239.210.94",
  transmitter_port: "7777",
  receiver_port: "7777",
  system_id: "telvoice.2way",
  system_type: "",
  bind_type: "transceiver",
  addr_ton: "0",
  addr_npi: "0",
  source_addr_ton: "0",
  source_addr_npi: "0",
  dest_addr_ton: "1",
  dest_addr_npi: "1",
  response_timeout_seconds: "300",
  enquire_link_interval_seconds: "45",
  submit_speed_per_second: "10",
  delay_time_seconds: "0",
  sessions: "1",
  tps_limit: "10",
  message_types_allowed: "Flash SMS, Text, Unicode, Unicode Flash SMS",
  route_type: "direct",
  currency: "USD",
  credit_limit: "100000",
  identifier: "29",
  log_level: "off",
  account_active: "yes",
  status: "testing",
  notes: "PTG_2WAY account migrated from aSMSC reference.",
};

/**
 * Prefill del formulario SMPP al crear cuenta desde un vendor.
 * Password siempre vacío — el operador la ingresa manualmente.
 */
export function resolveSmppVendorPrefill(
  providers: WholesaleProviderRow[],
  providerId?: string,
): Record<string, unknown> | undefined {
  const id = providerId?.trim();
  if (!id) return undefined;

  const provider = providers.find((p) => p.id === id);
  const base: Record<string, unknown> = { provider_id: id };

  if (provider?.code === PTG_PACIFIC_PROVIDER_CODE) {
    return { ...PTG_2WAY_ACCOUNT_PRESET, ...base };
  }

  return base;
}
