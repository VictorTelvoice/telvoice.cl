import type { AuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import {
  extractSmsQuantityFromText,
  formatPlansCatalogMessage,
  quoteFromText,
} from "./commercialQuoteService.js";
import {
  buildTelegramCapabilitiesMessage,
  matchesCapabilitiesIntent,
} from "./telegramCapabilities.js";
import { answerKnowledgeQuestion } from "./telegramKnowledge.js";
import {
  filterKnowledgeSearchResults,
  KNOWLEDGE_MIN_SCORE,
  searchKnowledgeRaw,
} from "./knowledgeService.js";

function detectInternationalIntent(text: string): boolean {
  const normalized = normalizeIntentText(text);
  return (
    /\binternacional\b/.test(normalized) ||
    /\bglobal\b/.test(normalized) ||
    /\brutas globales\b/.test(normalized) ||
    /\bsmpp mayorista\b/.test(normalized) ||
    /\botro pais\b/.test(normalized)
  );
}

export type TelegramIntentRoute =
  | "operational"
  | "commercial"
  | "knowledge"
  | "capabilities"
  | "fallback";

export type CommercialIntentKind =
  | "planes"
  | "precios"
  | "bolsas"
  | "comprar"
  | "cotizar"
  | "cuanto_cuesta"
  | "necesito_sms"
  | "mas_sms"
  | "use_case_chile";

export interface CommercialIntentDetail {
  kind: CommercialIntentKind;
  hasQuantity: boolean;
  quantity: number | null;
  wantsMoreSms: boolean;
}

export interface TelegramIntentClassification {
  route: TelegramIntentRoute;
  normalizedText: string;
  originalText: string;
  operationalCommand: string | null;
  commercial: CommercialIntentDetail | null;
}

export const COMMERCIAL_ASK_QUANTITY_MESSAGE = `Perfecto, te ayudo a comprar una bolsa SMS para Chile.

¿Cuántos SMS lleva tu bolsa? (múltiplos de 1.000, mínimo 1.000)

Puedes responder solo con el número, por ejemplo:
30000

O escribir:
cotizar 30000 sms

Referencia de precios por volumen:
• 1.000–4.999 SMS: $10 + IVA/SMS
• 5.000–9.999: $9 + IVA/SMS
• 10.000–14.999: $8 + IVA/SMS
• 15.000–49.999: $7 + IVA/SMS
• 50.000–99.999: $6 + IVA/SMS
• 100.000+: $5 + IVA/SMS`;

export const TELEGRAM_INTENT_TEST_CASES: {
  input: string;
  expectedRoute: TelegramIntentRoute;
  expectedQuantity?: number;
}[] = [
  { input: "hola quiero comprar mas sms", expectedRoute: "commercial" },
  { input: "Hola quiero comprar más SMS", expectedRoute: "commercial" },
  { input: "quiero comprar más sms", expectedRoute: "commercial" },
  {
    input: "Me gustaría comprar una nueva bolsa, cuál me recomiendas",
    expectedRoute: "commercial",
  },
  { input: "Comprar", expectedRoute: "commercial" },
  {
    input: "Si dame el link para pagar",
    expectedRoute: "fallback",
  },
  { input: "quiero comprar una bolsa", expectedRoute: "commercial" },
  { input: "Hola", expectedRoute: "fallback" },
  { input: "necesito cargar saldo", expectedRoute: "commercial" },
  { input: "quiero 30000 sms", expectedRoute: "commercial", expectedQuantity: 30000 },
  {
    input: "cuánto cuesta 70000 sms",
    expectedRoute: "commercial",
    expectedQuantity: 70000,
  },
  {
    input: "¿Qué puedes hacer por mí?",
    expectedRoute: "capabilities",
  },
  {
    input: "en qué puedes ayudarme",
    expectedRoute: "capabilities",
  },
  { input: "qué significa submitted", expectedRoute: "knowledge" },
  { input: "qué significa sms tipo P", expectedRoute: "knowledge" },
  { input: "saldo", expectedRoute: "operational" },
  {
    input: "enviar 56934449937 hola",
    expectedRoute: "operational",
  },
];

export function normalizeIntentText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuantityFromNormalized(normalized: string): number | null {
  return extractSmsQuantityFromText(normalized);
}

export function isExplicitKnowledgeQuestion(normalized: string): boolean {
  if (
    /^(que significa|que es|por que|como funciona|diferencia entre|que pasa si)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(submitted|delivered|failed|dlr|provider_status|whitelisted|ip not|localhost)\b/.test(
      normalized,
    ) &&
    /\b(que significa|que es|por que|significa)\b/.test(normalized)
  ) {
    return true;
  }

  if (/\b(sms tipo|tipo p|tipo t)\b/.test(normalized) && /\b(que|significa|diferencia)\b/.test(normalized)) {
    return true;
  }

  if (/^(buscar|\/buscar)\b/.test(normalized)) {
    return true;
  }

  if (/^que es una bolsa\b/.test(normalized)) {
    return true;
  }

  return false;
}

export function matchesCommercialBuyIntent(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  if (normalized === "comprar" || normalized === "cotizar" || normalized === "precios" || normalized === "planes" || normalized === "bolsas") {
    return true;
  }

  const patterns = [
    /\bquiero comprar\b/,
    /\bme gustaria comprar\b/,
    /\bdeseo comprar\b/,
    /\bcomprar mas sms\b/,
    /\bcomprar sms\b/,
    /\bcomprar\b.*\bbolsa\b/,
    /\bcomprar una bolsa\b/,
    /\bcomprar bolsa\b/,
    /\bnueva bolsa\b/,
    /\buna bolsa\b/,
    /\bnecesito comprar\b/,
    /\bnecesito mas sms\b/,
    /\bnecesito mas mensajes\b/,
    /\bnecesito una bolsa\b/,
    /\bquiero mas sms\b/,
    /\bquiero mas mensajes\b/,
    /\bquiero una bolsa\b/,
    /\bmas sms\b/,
    /\brecargar sms\b/,
    /\bcargar sms\b/,
    /\bcargar saldo\b/,
    /\bagregar saldo\b/,
    /\bnecesito cotizar\b/,
    /\bquiero cotizar\b/,
    /\bcuanto cuesta\b/,
    /\bcotizar\b/,
    /\bcotiza\b/,
    /\bnecesito \d+[\d\s]* sms\b/,
    /\bquiero \d+[\d\s]* sms\b/,
    /\bcomprar \d+[\d\s]* sms\b/,
    /\bquiero sms para\b/,
    /\bnecesito sms para\b/,
    /\brecomiendas\b.*\b(bolsa|sms)\b/,
    /\b(bolsa|sms)\b.*\brecomiendas\b/,
    /\benviar campanas en chile\b/,
    /\bcampanas en chile\b/,
    /\bprecios\b/,
    /\bplanes\b/,
    /\bbolsas\b/,
  ];

  return patterns.some((p) => p.test(normalized));
}

export function detectCommercialIntent(text: string): CommercialIntentDetail | null {
  const normalized = normalizeIntentText(text);
  if (!normalized) {
    return null;
  }

  if (detectInternationalIntent(text)) {
    return null;
  }

  if (isExplicitKnowledgeQuestion(normalized) && !matchesCommercialBuyIntent(normalized)) {
    return null;
  }

  const quantity = extractQuantityFromNormalized(normalized);
  const hasQuantity = quantity !== null;
  const wantsMoreSms =
    /\b(mas sms|mas mensajes|comprar mas|necesito mas|quiero mas|recargar|cargar saldo|agregar saldo)\b/.test(
      normalized,
    );

  let kind: CommercialIntentKind = "comprar";

  if (/\bplanes\b/.test(normalized) && normalized.split(" ").length <= 3) {
    kind = "planes";
  } else if (/\bprecios\b/.test(normalized)) {
    kind = "precios";
  } else if (
    (/\bbolsas\b/.test(normalized) || /\bbolsa\b/.test(normalized)) &&
    !/\bque es una bolsa\b/.test(normalized)
  ) {
    const wantsPurchase =
      /\b(comprar|quiero|necesito|nueva bolsa|mas sms|cotizar)\b/.test(
        normalized,
      );
    if (wantsPurchase && hasQuantity) {
      kind = "cotizar";
    } else if (wantsPurchase || /\brecomiendas\b/.test(normalized)) {
      kind = "comprar";
    } else {
      kind = "bolsas";
    }
  } else if (hasQuantity || /\bcotizar\b|\bcotiza\b/.test(normalized)) {
    kind = "cotizar";
  } else if (/\bcuanto cuesta\b/.test(normalized)) {
    kind = "cuanto_cuesta";
  } else if (wantsMoreSms) {
    kind = "mas_sms";
  } else if (/\bnecesito \d+/.test(normalized) && /\bsms\b/.test(normalized)) {
    kind = "necesito_sms";
  } else if (
    /\b(retail|ecommerce|otp|campaña|campana|empresa)\b/.test(normalized) &&
    /\bsms\b/.test(normalized)
  ) {
    kind = "use_case_chile";
  } else if (!matchesCommercialBuyIntent(normalized)) {
    return null;
  }

  return {
    kind,
    hasQuantity,
    quantity,
    wantsMoreSms,
  };
}

export function detectOperationalCommand(
  text: string,
  commandToken: string,
): string | null {
  const normalized = normalizeIntentText(text);

  if (commandToken === "/start" || normalized === "start") {
    return "start";
  }
  if (commandToken === "/ayuda" || normalized === "ayuda") {
    return "ayuda";
  }
  if (commandToken === "/saldo" || normalized === "saldo") {
    return "saldo";
  }
  if (commandToken === "/historial" || normalized === "historial") {
    return "historial";
  }
  if (commandToken === "/enviar" || /^enviar \d{8,15}\b/.test(normalized)) {
    return "enviar";
  }
  if (commandToken === "/buscar" || normalized.startsWith("buscar ")) {
    return "buscar";
  }
  if (
    commandToken === "/planes" ||
    commandToken === "/precios" ||
    commandToken === "/bolsas"
  ) {
    return commandToken.slice(1);
  }

  return null;
}

export function classifyTelegramIntent(
  text: string,
  commandToken: string,
): TelegramIntentClassification {
  const normalizedText = normalizeIntentText(text);
  const operationalCommand = detectOperationalCommand(text, commandToken);

  if (
    operationalCommand &&
    ["start", "ayuda", "saldo", "historial", "enviar", "buscar"].includes(
      operationalCommand,
    )
  ) {
    return {
      route: "operational",
      normalizedText,
      originalText: text.trim(),
      operationalCommand,
      commercial: null,
    };
  }

  const commercial = detectCommercialIntent(text);
  if (!commercial && matchesCommercialBuyIntent(normalizedText)) {
    return {
      route: "commercial",
      normalizedText,
      originalText: text.trim(),
      operationalCommand: null,
      commercial: {
        kind: "comprar",
        hasQuantity: false,
        quantity: null,
        wantsMoreSms: /\b(mas sms|mas mensajes|comprar mas)\b/.test(normalizedText),
      },
    };
  }

  if (commercial) {
    return {
      route: "commercial",
      normalizedText,
      originalText: text.trim(),
      operationalCommand: null,
      commercial,
    };
  }

  if (matchesCapabilitiesIntent(normalizedText)) {
    return {
      route: "capabilities",
      normalizedText,
      originalText: text.trim(),
      operationalCommand: null,
      commercial: null,
    };
  }

  if (isExplicitKnowledgeQuestion(normalizedText)) {
    return {
      route: "knowledge",
      normalizedText,
      originalText: text.trim(),
      operationalCommand: null,
      commercial: null,
    };
  }

  return {
    route: "fallback",
    normalizedText,
    originalText: text.trim(),
    operationalCommand: null,
    commercial: null,
  };
}

export async function buildKnowledgeReplySafe(text: string): Promise<string> {
  const normalized = normalizeIntentText(text);
  if (matchesCommercialBuyIntent(normalized)) {
    const commercial = detectCommercialIntent(text);
    if (commercial) {
      return buildCommercialTelegramReply(text, commercial, null);
    }
    return COMMERCIAL_ASK_QUANTITY_MESSAGE;
  }

  const results = filterKnowledgeSearchResults(
    await searchKnowledgeRaw(text, 8),
  );
  if (results.length === 0) {
    const raw = await searchKnowledgeRaw(text, 3);
    if (raw.length > 0 && raw[0]!.score < KNOWLEDGE_MIN_SCORE) {
      return (
        "No encontré una respuesta exacta en la base Telvoice. Puedes preguntarme sobre saldo, envío SMS, DLR, submitted, delivered, failed, IP whitelist, API o Telegram.\n\n" +
        "Para comprar bolsas SMS en Chile escribe: quiero comprar sms o cotizar 30000 sms"
      );
    }
    return answerKnowledgeQuestion(text);
  }
  return answerKnowledgeQuestion(text);
}

export async function buildCommercialTelegramReply(
  text: string,
  commercial: CommercialIntentDetail,
  auth: AuthorizedTelegramClient | null,
): Promise<string> {
  if (detectInternationalIntent(text)) {
    return "Telvoice.cl vende SMS masivos solo para Chile (Entel, Movistar, Claro, WOM). Para operación internacional o mayorista, consulta Telvoice.net.";
  }

  if (commercial.hasQuantity && commercial.quantity !== null) {
    const quote = await quoteFromText(text);
    if (quote) {
      return quote.commercial_message;
    }
  }

  if (commercial.wantsMoreSms || commercial.kind === "mas_sms") {
    if (auth) {
      return (
        `Tu cliente asociado es ${auth.client.company_name}. Puedo ayudarte a cotizar una nueva bolsa para cargar más saldo.\n\n` +
        `¿Cuántos SMS necesitas comprar? Por ejemplo: cotizar 15000 sms`
      );
    }
    return (
      "Te puedo ayudar a cotizar una bolsa SMS para Chile. ¿Cuántos SMS necesitas comprar?\n\n" +
      "Ejemplo: cotizar 30000 sms"
    );
  }

  if (
    commercial.kind === "planes" ||
    commercial.kind === "precios" ||
    commercial.kind === "bolsas"
  ) {
    return formatPlansCatalogMessage();
  }

  if (
    commercial.kind === "cotizar" ||
    commercial.kind === "cuanto_cuesta" ||
    commercial.kind === "necesito_sms"
  ) {
    if (!commercial.hasQuantity) {
      return "Indica la cantidad de SMS, por ejemplo: cotizar 5000 sms o cuánto cuesta 30000 sms";
    }
  }

  if (
    commercial.kind === "comprar" ||
    commercial.kind === "use_case_chile" ||
    /\brecomiendas\b/.test(normalizeIntentText(text))
  ) {
    return (
      COMMERCIAL_ASK_QUANTITY_MESSAGE +
      "\n\nSi prefieres, dime cuántos SMS necesitas (ej. 15000) y te recomiendo el tramo según la calculadora Telvoice.cl."
    );
  }

  return COMMERCIAL_ASK_QUANTITY_MESSAGE;
}

export interface TelegramIntentSimulationResult {
  originalText: string;
  normalizedText: string;
  route: TelegramIntentRoute;
  operationalCommand: string | null;
  commercial: CommercialIntentDetail | null;
  detectedQuantity: number | null;
  replyPreview: string;
  testCaseMatch: boolean | null;
}

const COMMAND_ALIASES: Record<string, string> = {
  start: "/start",
  ayuda: "/ayuda",
  saldo: "/saldo",
  historial: "/historial",
  enviar: "/enviar",
  buscar: "/buscar",
  planes: "/planes",
  precios: "/precios",
  bolsas: "/bolsas",
};

function commandTokenFromText(text: string): string {
  const first = text.trim().split(/\s+/)[0] ?? "";
  const stripped = first.replace(/@\w+$/i, "").toLowerCase();
  if (stripped.startsWith("/")) {
    return stripped;
  }
  return COMMAND_ALIASES[stripped] ?? `/${stripped}`;
}

export async function simulateTelegramIntent(
  text: string,
  auth: AuthorizedTelegramClient | null = null,
): Promise<TelegramIntentSimulationResult> {
  const trimmed = text.trim();
  const commandToken = commandTokenFromText(trimmed);
  const classification = classifyTelegramIntent(trimmed, commandToken);

  let replyPreview = "";

  if (classification.route === "operational") {
    replyPreview = `[Operativo] Comando: ${classification.operationalCommand ?? "—"} (requiere autorización para saldo/historial/enviar)`;
  } else if (classification.route === "commercial" && classification.commercial) {
    replyPreview = await buildCommercialTelegramReply(
      trimmed,
      classification.commercial,
      auth,
    );
  } else if (classification.route === "knowledge") {
    replyPreview = await buildKnowledgeReplySafe(trimmed);
  } else if (classification.route === "capabilities") {
    replyPreview = buildTelegramCapabilitiesMessage(!!auth);
  } else {
    const commercial = detectCommercialIntent(trimmed);
    if (commercial) {
      replyPreview = await buildCommercialTelegramReply(trimmed, commercial, auth);
    } else {
      replyPreview = await buildKnowledgeReplySafe(trimmed);
    }
  }

  const testCase = TELEGRAM_INTENT_TEST_CASES.find(
    (t) => normalizeIntentText(t.input) === classification.normalizedText,
  );

  return {
    originalText: trimmed,
    normalizedText: classification.normalizedText,
    route: classification.route,
    operationalCommand: classification.operationalCommand,
    commercial: classification.commercial,
    detectedQuantity: classification.commercial?.quantity ?? extractQuantityFromNormalized(classification.normalizedText),
    replyPreview,
    testCaseMatch: testCase
      ? testCase.expectedRoute === classification.route &&
        (testCase.expectedQuantity === undefined ||
          testCase.expectedQuantity === classification.commercial?.quantity)
      : null,
  };
}
