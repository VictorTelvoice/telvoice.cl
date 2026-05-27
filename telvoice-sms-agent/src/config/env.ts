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
  /** Si true, aplica tope diario (env + política telco). Por defecto el panel /app solo limita por saldo SMS. */
  enforceDailyLimit: boolean;
  liveTestMinSecondsBetweenSends: number;
  liveTestMaxSegments: number;
};

export type SmsCampaignConfig = {
  enabled: boolean;
  /** Vacío = todos los números válidos CL; false = respeta SMS_LIVE_TEST_ALLOWED_NUMBERS */
  skipNumberWhitelist: boolean;
  /** Modo mass: encolar en cola si destinatarios >= este umbral (1 = siempre cola). */
  bulkQueueMinRecipients: number;
  trafficType: string;
  /** Separación mínima entre ítems en cola (ms). Alineado con ~3s entre envíos en Test12/13. */
  queueMinPaceMs: number;
};

export type SmsLiveCampaignConfig = {
  maxRecipients: number;
  maxSegments: number;
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

export type BillingEmailMode = "mock" | "resend" | "sendgrid" | "smtp";

function normalizeBillingEmailMode(value: string): BillingEmailMode {
  const v = value.trim().toLowerCase();
  if (v === "resend" || v === "sendgrid" || v === "smtp") {
    return v;
  }
  return "mock";
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
    /** Para login Google en frontend (Supabase Auth). */
    publicUrl: normalizeSupabaseUrl(
      optionalEnv("VITE_SUPABASE_URL", optionalEnv("SUPABASE_URL")),
    ),
    /** Anon/publishable key (NUNCA service_role). */
    publishableKey: optionalEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
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
    enforceDailyLimit:
      optionalEnv("SMS_ENFORCE_DAILY_LIMIT", "false") === "true",
    liveTestMinSecondsBetweenSends: parsePositiveIntEnv(
      "SMS_LIVE_TEST_MIN_SECONDS_BETWEEN_SENDS",
      5,
    ),
    liveTestMaxSegments: parsePositiveIntEnv("SMS_LIVE_TEST_MAX_SEGMENTS", 3),
  } satisfies SmsProviderConfig,
  smsCampaign: {
    enabled: optionalEnv("SMS_CAMPAIGN_ENABLED", "true") === "true",
    skipNumberWhitelist:
      optionalEnv("SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST", "true") === "true",
    bulkQueueMinRecipients: parsePositiveIntEnv(
      "SMS_CAMPAIGN_BULK_QUEUE_MIN_RECIPIENTS",
      1,
    ),
    trafficType: optionalEnv("SMS_CAMPAIGN_TRAFFIC_TYPE", "promotional"),
    queueMinPaceMs:
      parsePositiveIntEnv("SMS_CAMPAIGN_QUEUE_MIN_PACE_SECONDS", 3) * 1000,
  } satisfies SmsCampaignConfig,
  smsLiveCampaign: {
    maxRecipients: parsePositiveIntEnv("SMS_LIVE_CAMPAIGN_MAX_RECIPIENTS", 50),
    maxSegments: parsePositiveIntEnv("SMS_LIVE_CAMPAIGN_MAX_SEGMENTS", 3),
  } satisfies SmsLiveCampaignConfig,
  /** TPS global de plataforma (techo superior; no sustituye MAX_CLIENT_TPS). */
  smsPlatformMaxTps: parsePositiveIntEnv("SMS_PLATFORM_MAX_TPS", 100),
  /** Procesa automáticamente la cola de envíos programados (scheduled_at). */
  smsQueueScheduler: {
    enabled: optionalEnv("SMS_QUEUE_SCHEDULER_ENABLED", "true") === "true",
    intervalSeconds: parsePositiveIntEnv("SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS", 1),
    batchSize: parsePositiveIntEnv("SMS_QUEUE_SCHEDULER_BATCH_SIZE", 20),
  },
  telsim: {
    webhookSecret: optionalEnv("TELSIM_WEBHOOK_SECRET"),
    /** Solo desarrollo: omitir verificación de firma (nunca en producción). */
    skipSignatureVerify:
      optionalEnv("TELSIM_WEBHOOK_SKIP_VERIFY", "false") === "true",
  },
  billingEmail: {
    mode: normalizeBillingEmailMode(optionalEnv("BILLING_EMAIL_MODE", "mock")),
    from: optionalEnv("BILLING_EMAIL_FROM", "facturacion@telvoice.cl"),
    provider: optionalEnv("BILLING_EMAIL_PROVIDER"),
    replyTo: optionalEnv("BILLING_EMAIL_REPLY_TO", "soporte@telvoice.cl"),
  },
} as const;

export function isBillingEmailMock(): boolean {
  return env.billingEmail.mode === "mock";
}

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

/** Webhook entrante SMS recibidos en líneas telsim.io */
export function buildTelsimWebhookUrl(): string | undefined {
  if (!env.publicWebhookBaseUrl) {
    return undefined;
  }
  return `${env.publicWebhookBaseUrl}/api/webhooks/telsim/sms`;
}

export function isProduction(): boolean {
  return env.nodeEnv === "production";
}
