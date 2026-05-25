import "dotenv/config";
import { normalizeSupabaseUrl } from "../database/supabase-factory.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Variable de entorno requerida: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function normalizeAsmscSmsType(value: string): "P" | "T" {
  const upper = value.trim().toUpperCase();
  return upper === "T" ? "T" : "P";
}

function normalizeTelegramMode(value: string): "polling" | "webhook" {
  return value.trim().toLowerCase() === "webhook" ? "webhook" : "polling";
}

function parseCsvEnv(name: string): string[] {
  const raw = optionalEnv(name);
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SmsProviderMode = "mock" | "live_test";

export type SmsProviderConfig = {
  mode: SmsProviderMode;
  provider: string;
  liveTestEnabled: boolean;
  liveTestAllowedCompanyIds: string[];
  liveTestAllowedNumbers: string[];
  liveTestDailyLimit: number;
  liveTestMinSecondsBetweenSends: number;
  liveTestMaxSegments: number;
};

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name, String(fallback));
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

function normalizeSmsProviderMode(value: string): SmsProviderMode {
  return value.trim().toLowerCase() === "live_test" ? "live_test" : "mock";
}

export const env = {
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  port: Number.parseInt(optionalEnv("PORT", "3001"), 10),
  asmsc: {
    baseUrl: optionalEnv("ASMSC_BASE_URL", "http://api.telvoice.net/api").replace(
      /\/$/,
      "",
    ),
    apiId: optionalEnv("ASMSC_API_ID"),
    apiPassword: optionalEnv("ASMSC_API_PASSWORD"),
    defaultSenderId: optionalEnv("ASMSC_DEFAULT_SENDER_ID"),
    defaultSmsType: normalizeAsmscSmsType(
      optionalEnv("ASMSC_DEFAULT_SMS_TYPE", "P"),
    ),
  },
  telegram: {
    botToken: optionalEnv("TELEGRAM_BOT_TOKEN"),
    allowedUserIds: optionalEnv("TELEGRAM_ALLOWED_USER_IDS"),
    mode: normalizeTelegramMode(optionalEnv("TELEGRAM_MODE", "polling")),
    webhookSecret: optionalEnv("TELEGRAM_WEBHOOK_SECRET"),
    webhookPath: optionalEnv(
      "TELEGRAM_WEBHOOK_PATH",
      "/api/telegram/webhook",
    ),
  },
  publicWebhookBaseUrl: optionalEnv("PUBLIC_WEBHOOK_BASE_URL").replace(/\/$/, ""),
  supabase: {
    url: normalizeSupabaseUrl(optionalEnv("SUPABASE_URL")),
    serviceRoleKey: optionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },
  encryptionKey: optionalEnv("ENCRYPTION_KEY"),
  admin: {
    superadminEmail: optionalEnv("SUPERADMIN_EMAIL"),
    superadminPassword: optionalEnv("SUPERADMIN_PASSWORD"),
    superadminName: optionalEnv("SUPERADMIN_NAME", "Superadmin Telvoice"),
    jwtSecret: optionalEnv("JWT_SECRET"),
    sessionSecret: optionalEnv("SESSION_SECRET"),
    /** Permite /admin/register con cuenta @gmail.com */
    signupEnabled: optionalEnv("ADMIN_SIGNUP_ENABLED", "false") === "true",
  },
  /** URL pública del agente (producción: https://agent.telvoice.cl) */
  publicAppUrl: optionalEnv("PUBLIC_APP_URL", "http://localhost:3001").replace(
    /\/$/,
    "",
  ),
  /** Sitio Telvoice.cl (back_urls y webhook MercadoPago) */
  publicSiteUrl: optionalEnv("PUBLIC_SITE_URL", "https://www.telvoice.cl").replace(
    /\/$/,
    "",
  ),
  mercadopago: {
    accessToken: optionalEnv("MERCADOPAGO_ACCESS_TOKEN"),
    sandbox: optionalEnv("MERCADOPAGO_SANDBOX", "true") === "true",
    testPayerEmail: optionalEnv("MERCADOPAGO_TEST_PAYER_EMAIL"),
    /** Opcional: sobreescriben back_urls del panel /app (default: PUBLIC_APP_URL + /app/payments/mercadopago/...) */
    successUrlApp: optionalEnv("MERCADOPAGO_SUCCESS_URL_APP"),
    failureUrlApp: optionalEnv("MERCADOPAGO_FAILURE_URL_APP"),
    pendingUrlApp: optionalEnv("MERCADOPAGO_PENDING_URL_APP"),
  },
  databaseUrl: optionalEnv("DATABASE_URL"),
  smsProvider: {
    mode: normalizeSmsProviderMode(optionalEnv("SMS_PROVIDER_MODE", "live_test")),
    provider: optionalEnv("SMS_PROVIDER", "real_api"),
    liveTestEnabled: optionalEnv("SMS_LIVE_TEST_ENABLED", "true") === "true",
    liveTestAllowedCompanyIds: parseCsvEnv("SMS_LIVE_TEST_ALLOWED_COMPANY_IDS"),
    liveTestAllowedNumbers: parseCsvEnv("SMS_LIVE_TEST_ALLOWED_NUMBERS"),
    liveTestDailyLimit: parsePositiveIntEnv("SMS_LIVE_TEST_DAILY_LIMIT", 10_000),
    liveTestMinSecondsBetweenSends: parsePositiveIntEnv(
      "SMS_LIVE_TEST_MIN_SECONDS_BETWEEN_SENDS",
      5,
    ),
    liveTestMaxSegments: parsePositiveIntEnv("SMS_LIVE_TEST_MAX_SEGMENTS", 3),
  } satisfies SmsProviderConfig,
  /** TPS global de plataforma (techo superior; no sustituye MAX_CLIENT_TPS). */
  smsPlatformMaxTps: parsePositiveIntEnv("SMS_PLATFORM_MAX_TPS", 100),
  /** Procesa automáticamente la cola de envíos programados (scheduled_at). */
  smsQueueScheduler: {
    enabled: optionalEnv("SMS_QUEUE_SCHEDULER_ENABLED", "true") === "true",
    intervalSeconds: parsePositiveIntEnv("SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS", 60),
    batchSize: parsePositiveIntEnv("SMS_QUEUE_SCHEDULER_BATCH_SIZE", 15),
  },
} as const;

export function isMercadoPagoConfigured(): boolean {
  return Boolean(env.mercadopago.accessToken);
}

export function assertAdminAuthConfig(): void {
  requireEnv("JWT_SECRET");
  requireEnv("SESSION_SECRET");
}

export function assertSuperadminSeedConfig(): void {
  requireEnv("SUPERADMIN_EMAIL");
  requireEnv("SUPERADMIN_PASSWORD");
}

export function assertAsmscCredentials(): void {
  requireEnv("ASMSC_API_ID");
  requireEnv("ASMSC_API_PASSWORD");
}

export function assertSupabaseCredentials(): void {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function buildDlrCallbackUrl(): string | undefined {
  if (!env.publicWebhookBaseUrl) {
    return undefined;
  }
  return `${env.publicWebhookBaseUrl}/api/webhooks/asmsc/dlr`;
}

export function isProduction(): boolean {
  return env.nodeEnv === "production";
}
