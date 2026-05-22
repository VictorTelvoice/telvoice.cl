import type { AsmscApiResponse } from "../types/asmsc.js";
import { pickString } from "./asmsc-response.js";
import { AppError } from "./errors.js";

export interface AsmscBalanceSummary {
  balanceAmount: string | null;
  currencyCode: string | null;
  providerMessage: string | null;
  error: string | null;
}

export function parseAsmscBalanceSummary(
  provider: AsmscApiResponse | null,
  fetchError?: unknown,
): AsmscBalanceSummary {
  if (fetchError) {
    const message =
      fetchError instanceof AppError
        ? fetchError.message
        : fetchError instanceof Error
          ? fetchError.message
          : "Error al consultar balance aSMSC";
    return {
      balanceAmount: null,
      currencyCode: null,
      providerMessage: null,
      error: message,
    };
  }

  if (!provider) {
    return {
      balanceAmount: null,
      currencyCode: null,
      providerMessage: null,
      error: "Sin respuesta",
    };
  }

  const record = provider as Record<string, unknown>;
  const balanceAmount = pickString(
    record,
    "BalanceAmount",
    "balance_amount",
    "balance",
  );
  const currencyCode = pickString(
    record,
    "CurrenceCode",
    "CurrencyCode",
    "currency_code",
  );
  const providerMessage = pickString(
    record,
    "remarks",
    "Remarks",
    "message",
    "status",
  );
  const status = String(record.status ?? "").toUpperCase();
  const error =
    status === "F" && providerMessage ? providerMessage : null;

  return {
    balanceAmount: balanceAmount ?? providerMessage,
    currencyCode,
    providerMessage,
    error,
  };
}
