import { isIpWhitelistProviderError } from "../utils/asmsc-hints.js";

export type ProviderRejectionStrategy =
  | "fail_fast_ip_whitelist"
  | "fail_terminal"
  | "requeue";

/**
 * Decide si reintentar, fallar terminal o fail-fast ante IP whitelist (Etapa 7.2).
 */
export function resolveProviderRejectionStrategy(input: {
  errorMessage: string | null | undefined;
  rawResponse?: Record<string, unknown> | null;
  attemptAfterProcessing: number;
  maxAttempts: number;
}): ProviderRejectionStrategy {
  if (isIpWhitelistProviderError(input.errorMessage, input.rawResponse ?? undefined)) {
    return "fail_fast_ip_whitelist";
  }
  if (input.attemptAfterProcessing >= input.maxAttempts) {
    return "fail_terminal";
  }
  return "requeue";
}
