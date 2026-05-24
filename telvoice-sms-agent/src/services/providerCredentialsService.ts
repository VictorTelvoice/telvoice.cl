import { env } from "../config/env.js";
import type { SmsProviderRow } from "../types/sms-routing.js";

export type HttpApiProviderCredentials = {
  baseUrl: string;
  apiId: string;
  apiPassword: string;
  defaultSenderId: string;
  defaultSmsType: "P" | "T";
  envPrefix: string;
};

function normalizeSmsType(value: string | undefined): "P" | "T" {
  const upper = (value ?? "P").trim().toUpperCase();
  return upper === "T" ? "T" : "P";
}

function envKey(prefix: string, suffix: string): string {
  return `${prefix}_${suffix}`;
}

/** Credenciales HTTP API desde metadata.env_prefix o código del proveedor. */
export function resolveHttpApiCredentials(
  provider: SmsProviderRow,
): HttpApiProviderCredentials {
  const meta = provider.metadata ?? {};
  const code = provider.code.toLowerCase();

  let prefix =
    typeof meta.env_prefix === "string" && meta.env_prefix.trim()
      ? meta.env_prefix.trim().toUpperCase()
      : "";

  if (!prefix) {
    if (code === "asmsc" || code === "almuqeet") {
      prefix = "ASMSC";
    } else {
      prefix = provider.code.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    }
  }

  if (prefix === "ASMSC") {
    return {
      envPrefix: prefix,
      baseUrl: env.asmsc.baseUrl,
      apiId: env.asmsc.apiId,
      apiPassword: env.asmsc.apiPassword,
      defaultSenderId: env.asmsc.defaultSenderId,
      defaultSmsType: env.asmsc.defaultSmsType,
    };
  }

  const baseUrl = (
    process.env[envKey(prefix, "BASE_URL")] ??
    provider.api_base_url ??
    env.asmsc.baseUrl
  ).replace(/\/$/, "");

  return {
    envPrefix: prefix,
    baseUrl,
    apiId: (process.env[envKey(prefix, "API_ID")] ?? "").trim(),
    apiPassword: (process.env[envKey(prefix, "API_PASSWORD")] ?? "").trim(),
    defaultSenderId: (
      process.env[envKey(prefix, "DEFAULT_SENDER_ID")] ??
      provider.default_sender_id ??
      env.asmsc.defaultSenderId ??
      "TELVOICE"
    ).trim(),
    defaultSmsType: normalizeSmsType(
      process.env[envKey(prefix, "DEFAULT_SMS_TYPE")],
    ),
  };
}

export function isHttpApiProviderConfigured(
  provider: SmsProviderRow,
): boolean {
  const creds = resolveHttpApiCredentials(provider);
  return Boolean(creds.apiId && creds.apiPassword);
}
