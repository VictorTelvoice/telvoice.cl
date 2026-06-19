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
  /** QA/demo sin rate plan. Clientes con plan CL + live_enabled pueden enviar si true. */
  allowRatePlanCompaniesToSend: boolean;
  liveTestAllowedCompanyIds: string[];
  liveTestAllowedNumbers: string[];
  /** false = respeta SMS_LIVE_TEST_ALLOWED_NUMBERS en envíos del panel /app */
  skipNumberWhitelist: boolean;
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

/** Rate plan retail asignado automáticamente tras claim/compra sin plan activo. */
export type DefaultRetailRatePlanConfig = {
  ratePlanId: string;
  ratePlanCode: string;
  country: string;
  maxTps: number;
  liveEnabled: boolean;
  campaignsEnabled: boolean;
  apiEnabled: boolean;
  trafficTypes: string[];
};

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name, String(fallback));
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

function parseOptionalPositiveIntEnv(name: string): number | null {
  const raw = optionalEnv(name);
  if (!raw) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return null;
  }
  return n;
}

function normalizeSmsProviderMode(value: string): SmsProviderMode {
  return value.trim().toLowerCase() === "live_test" ? "live_test" : "mock";
}

export type BillingEmailMode = "mock" | "provider";

function normalizeBillingEmailMode(value: string): BillingEmailMode {
  const v = value.trim().toLowerCase();
  if (v === "mock") return "mock";
  // Esquema nuevo: BILLING_EMAIL_MODE=provider
  if (v === "provider") return "provider";
  // Compatibilidad: BILLING_EMAIL_MODE=resend|sendgrid|smtp
  if (v === "resend" || v === "sendgrid" || v === "smtp") return "provider";
  return "mock";
}

function normalizeBillingEmailProvider(
  modeRaw: string,
  providerRaw: string,
): string {
  const provider = providerRaw.trim().toLowerCase();
  if (provider) return provider;

  const mode = modeRaw.trim().toLowerCase();
  if (mode === "resend" || mode === "sendgrid" || mode === "smtp") return mode;
  return "";
}

export type TransactionalEmailMode = "mock" | "provider";
export type TransactionalEmailProvider = "resend" | "sendgrid" | "smtp" | "";

function normalizeTransactionalEmailMode(value: string): TransactionalEmailMode {
  const v = value.trim().toLowerCase();
  if (v === "provider") {
    return "provider";
  }
  return "mock";
}

function normalizeTransactionalEmailProvider(
  value: string,
): TransactionalEmailProvider {
  const v = value.trim().toLowerCase();
  if (v === "resend" || v === "sendgrid" || v === "smtp") {
    return v;
  }
  return "";
}

function hostnameFromUrl(url: string): string {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
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
    /**
     * URL pública de Supabase para login Google (/login).
     * Se lee al arrancar Node (dotenv); no hay bundle Vite con import.meta.env.
     */
    publicUrl: normalizeSupabaseUrl(
      optionalEnv("VITE_SUPABASE_URL", optionalEnv("SUPABASE_URL")),
    ),
    /** Anon/publishable key de Supabase (NUNCA service_role). */
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
  /** Pepper HMAC para API Keys reales (Fase 1+). No loguear ni commitear. */
  apiKeys: {
    pepper: optionalEnv("API_KEY_PEPPER"),
  },
  /** SHA del commit desplegado (escrito por CI/CD en el VPS). */
  deploy: {
    gitSha: optionalEnv("GIT_COMMIT_SHA"),
  },
  /** URL pública del agente (producción: https://agent.telvoice.cl) */
  publicAppUrl: optionalEnv("PUBLIC_APP_URL", "http://localhost:3001").replace(
    /\/$/,
    "",
  ),
  /** URL pública del superadmin (producción: https://admin.telvoice.cl) */
  publicAdminUrl: optionalEnv(
    "PUBLIC_ADMIN_URL",
    optionalEnv("NODE_ENV", "development") === "production"
      ? "https://admin.telvoice.cl"
      : "",
  ).replace(/\/$/, ""),
  /** Hostname del panel admin (derivado de PUBLIC_ADMIN_URL) */
  publicAdminHost: hostnameFromUrl(
    optionalEnv(
      "PUBLIC_ADMIN_URL",
      optionalEnv("NODE_ENV", "development") === "production"
        ? "https://admin.telvoice.cl"
        : "",
    ).replace(/\/$/, ""),
  ),
  /** Dev local: host alternativo para simular admin.telvoice.cl (ej. admin.localhost) */
  adminPanelHostDev: optionalEnv("ADMIN_PANEL_HOST_DEV").toLowerCase(),
  /** Sitio Telvoice.cl (back_urls y webhook MercadoPago) */
  publicSiteUrl: optionalEnv("PUBLIC_SITE_URL", "https://www.telvoice.cl").replace(
    /\/$/,
    "",
  ),
  /**
   * agent-qa / sim-qa: listar solo inventario metadata.qa_only=true.
   * Producción: oculta inventario qa_only.
   */
  simQaE2e: {
    inventoryQaOnlyListing:
      optionalEnv("SIM_QA_E2E_INVENTORY_QA_ONLY", "false") === "true" ||
      optionalEnv("PUBLIC_APP_URL", "").includes("agent-qa"),
  },
  /** Empresa interna Telvoice para VERIFY_TEST / QA admin (UUID). */
  internalQa: {
    companyId: optionalEnv("INTERNAL_QA_COMPANY_ID"),
  },
  /** Orígenes extra para CORS de /api/public/* (QA preview, separados por coma). */
  landingExtraOrigins: parseCsvEnv("LANDING_EXTRA_ORIGINS"),
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
    allowRatePlanCompaniesToSend:
      optionalEnv("ALLOW_RATE_PLAN_COMPANIES_TO_SEND", "true") === "true",
    liveTestAllowedCompanyIds: parseCsvEnv("SMS_LIVE_TEST_ALLOWED_COMPANY_IDS"),
    liveTestAllowedNumbers: parseCsvEnv("SMS_LIVE_TEST_ALLOWED_NUMBERS"),
    skipNumberWhitelist:
      optionalEnv(
        "SMS_PANEL_SKIP_NUMBER_WHITELIST",
        optionalEnv("SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST", "true"),
      ) === "true",
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
    provider: normalizeBillingEmailProvider(
      optionalEnv("BILLING_EMAIL_MODE", "mock"),
      optionalEnv("BILLING_EMAIL_PROVIDER", ""),
    ),
    replyTo: optionalEnv("BILLING_EMAIL_REPLY_TO", "soporte@telvoice.cl"),
  },
  transactionalEmail: {
    mode: normalizeTransactionalEmailMode(optionalEnv("EMAIL_MODE", "mock")),
    provider: normalizeTransactionalEmailProvider(optionalEnv("EMAIL_PROVIDER")),
    resendApiKey: optionalEnv("RESEND_API_KEY"),
    fromName: optionalEnv("EMAIL_FROM_NAME", "Telvoice"),
    fromAddress: optionalEnv("EMAIL_FROM_ADDRESS", "no-reply@telvoice.cl"),
    replyTo: optionalEnv("EMAIL_REPLY_TO", "soporte@telvoice.cl"),
  },
  support: {
    alertEmail: optionalEnv("TELVOICE_SUPPORT_ALERT_EMAIL"),
  },
  clientPanel: {
    /** POST /app/buy-sms (pago manual). Desactivado por defecto hasta habilitar operación. */
    manualCheckoutEnabled:
      optionalEnv("CLIENT_PANEL_MANUAL_CHECKOUT_ENABLED", "false") === "true",
    /** Mis números, SMS entrantes, Agente Telvoice y Planes del agente en /app. */
    agentLineEnabled:
      optionalEnv("CLIENT_PANEL_AGENT_LINE_ENABLED", "false") === "true",
  },
  /** Rollout controlado Fase 3: en producción solo correos en esta lista pueden comprar sim_agent_bundle. */
  simCheckout: {
    productionAllowlist: parseCsvEnv("SIM_CHECKOUT_PRODUCTION_ALLOWLIST"),
    /** Precio CLP de prueba para sim_starter bundle (solo emails en starterTestPriceEmails). */
    starterTestPriceClp: parseOptionalPositiveIntEnv("SIM_STARTER_TEST_PRICE_CLP"),
    starterTestPriceEmails: parseCsvEnv("SIM_STARTER_TEST_PRICE_EMAILS").map((e) =>
      e.trim().toLowerCase(),
    ),
  },
  /** Suscripción mensual SIM: precio mensual controlado en producción (allowlist + sufijo). */
  simSubscriptionQaReal: {
    enabled: optionalEnv("SIM_SUBSCRIPTION_QA_REAL_ENABLED", "false") === "true",
    emails: parseCsvEnv("SIM_SUBSCRIPTION_QA_REAL_EMAILS").map((e) =>
      e.trim().toLowerCase(),
    ),
    allowedSuffixes: parseCsvEnv("SIM_SUBSCRIPTION_QA_REAL_ALLOWED_SUFFIXES").map((s) =>
      s.trim().slice(-3),
    ),
    monthlyAmountClp: parseOptionalPositiveIntEnv(
      "SIM_SUBSCRIPTION_QA_REAL_MONTHLY_AMOUNT_CLP",
    ),
  },
  /** Starter 50% x N meses — panel cliente (allowlist por email). */
  simStarterPromo50: {
    enabled: optionalEnv("SIM_STARTER_PROMO_50_ENABLED", "true") === "true",
    emails: (
      parseCsvEnv("SIM_STARTER_PROMO_50_EMAILS").length > 0
        ? parseCsvEnv("SIM_STARTER_PROMO_50_EMAILS")
        : ["goclubai@gmail.com"]
    ).map((e) => e.trim().toLowerCase()),
    monthlyAmountClp:
      parseOptionalPositiveIntEnv("SIM_STARTER_PROMO_50_MONTHLY_CLP") ?? 14995,
    durationMonths: parsePositiveIntEnv("SIM_STARTER_PROMO_50_MONTHS", 6),
  },
  /** Webhook POST /api/webhooks/numeraciones/inbound (opcional en dev). */
  numeracionesInbound: {
    webhookSecret: optionalEnv("NUMERACIONES_INBOUND_WEBHOOK_SECRET"),
  },
  defaultRetailRatePlan: {
    ratePlanId: optionalEnv(
      "PUBLIC_CHECKOUT_DEFAULT_RATE_PLAN_ID",
      "5002ddd5-0732-4bf5-affd-d1e692ca39f0",
    ),
    ratePlanCode: optionalEnv(
      "PUBLIC_CHECKOUT_DEFAULT_RATE_PLAN_CODE",
      "TELVOICE_CL_RETAIL",
    ),
    country: optionalEnv("PUBLIC_CHECKOUT_DEFAULT_COUNTRY", "CL").toUpperCase(),
    maxTps: parsePositiveIntEnv("PUBLIC_CHECKOUT_DEFAULT_MAX_TPS", 2),
    liveEnabled:
      optionalEnv("PUBLIC_CHECKOUT_DEFAULT_LIVE_ENABLED", "true") === "true",
    campaignsEnabled:
      optionalEnv("PUBLIC_CHECKOUT_DEFAULT_CAMPAIGNS_ENABLED", "true") ===
      "true",
    apiEnabled:
      optionalEnv("PUBLIC_CHECKOUT_DEFAULT_API_ENABLED", "false") === "true",
    trafficTypes: ["transactional", "promotional"],
  } satisfies DefaultRetailRatePlanConfig,
} as const;

export function isBillingEmailMock(): boolean {
  return env.billingEmail.mode === "mock";
}

export function isTransactionalEmailMock(): boolean {
  return env.transactionalEmail.mode === "mock";
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

export type GoogleAuthEnvIssue = {
  kind: "missing_public_url" | "missing_publishable_key";
  message: string;
};

/** Variables necesarias para renderizar /login y /auth/callback con Supabase Auth. */
export function getGoogleAuthEnvIssues(): GoogleAuthEnvIssue[] {
  const issues: GoogleAuthEnvIssue[] = [];
  if (!env.supabase.publicUrl) {
    issues.push({
      kind: "missing_public_url",
      message:
        "Falta la URL de Supabase: define VITE_SUPABASE_URL o SUPABASE_URL en el .env del servidor.",
    });
  }
  if (!env.supabase.publishableKey) {
    issues.push({
      kind: "missing_publishable_key",
      message:
        "Falta la clave pública: define VITE_SUPABASE_PUBLISHABLE_KEY (anon/publishable en Supabase › Project Settings › API). No uses SUPABASE_SERVICE_ROLE_KEY en el login.",
    });
  }
  return issues;
}

export function isGoogleAuthConfigured(): boolean {
  return getGoogleAuthEnvIssues().length === 0;
}

export function isClientPanelAgentLineEnabled(): boolean {
  return env.clientPanel.agentLineEnabled;
}

/** Checkout landing SIM+agente: en producción exige allowlist; fuera de prod no restringe. */
export function isSimAgentBundleCheckoutEmailAllowed(email: string): boolean {
  if (!isProduction()) {
    return true;
  }
  const allowlist = env.simCheckout.productionAllowlist;
  if (allowlist.length === 0) {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  return allowlist.some((entry) => entry.trim().toLowerCase() === normalized);
}
