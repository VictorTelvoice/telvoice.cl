import { findCompanyById } from "../companyService.js";
import {
  cancelAllPendingForSessionDb,
} from "./agentPendingActionsService.js";
import { clearSendSmsFlowMemory } from "./agentSendSmsFlow.js";
import { updateConversationMemory } from "./agentConversationMemory.js";
import type {
  AgentChannel,
  AgentCoreResponse,
  AgentSuggestedAction,
} from "./types.js";

export const GREETING_QUICK_ACTIONS: AgentSuggestedAction[] = [
  { label: "Ver mi saldo", message: "¿Cuánto saldo tengo?" },
  { label: "Enviar SMS", message: "Quiero enviar un SMS" },
  { label: "Crear campaña", message: "Quiero enviar una campaña" },
  { label: "Comprar SMS", message: "Quiero comprar SMS" },
  { label: "Últimos envíos", message: "Muéstrame mis últimos envíos" },
  { label: "Ayuda DLR", message: "¿Qué significa submitted?" },
];

const OPERATIONAL_IN_GREETING_RE =
  /\b(quiero|necesito|comprar|cotizar|enviar|campana|sms|saldo|generar|link|pago|mercadopago|confirmo|dlr|envios|envio|ultimos|ultimo|ver mi|bolsa|planilla|csv|archivo|\d)\b/i;

function normalizeGreetingText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PURE_GREETING_PATTERNS = [
  /^hola(?:\s+(?:que tal|q tal|como estas|como andas|como va))?$/,
  /^hey$/,
  /^buenas(?:\s+(?:como estas|como andas|que tal|q tal))?$/,
  /^buenos dias$/,
  /^buenas tardes$/,
  /^buenas noches$/,
];

/** Saludo sin intención operativa (no reinicia si hay compra/envío/campaña en el mismo mensaje). */
export function isPureGreeting(text: string): boolean {
  const n = normalizeGreetingText(text);
  if (!n) {
    return false;
  }
  if (OPERATIONAL_IN_GREETING_RE.test(n)) {
    return false;
  }
  return PURE_GREETING_PATTERNS.some((re) => re.test(n));
}

export function extractFirstName(fullName: string): string {
  const t = fullName.trim();
  if (!t) {
    return "";
  }
  const first = t.split(/\s+/)[0] ?? t;
  if (first.length <= 3 && first === first.toUpperCase()) {
    return first;
  }
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function timeOfDayPhrase(localHour: number): string {
  const h = ((localHour % 24) + 24) % 24;
  if (h >= 5 && h < 12) {
    return "Buenos días";
  }
  if (h >= 12 && h < 20) {
    return "Buenas tardes";
  }
  return "Buenas noches";
}

export function resolveLocalHour(metadata?: Record<string, unknown>): number {
  const raw = metadata?.userLocalHour;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const h = Math.floor(raw);
    if (h >= 0 && h <= 23) {
      return h;
    }
  }
  const tz =
    typeof metadata?.userTimezone === "string" && metadata.userTimezone.trim()
      ? metadata.userTimezone.trim()
      : "America/Santiago";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    if (hourPart) {
      return parseInt(hourPart.value, 10);
    }
  } catch {
    /* fallback servidor */
  }
  return new Date().getHours();
}

export async function resolveDisplayNameForGreeting(input: {
  metadata?: Record<string, unknown>;
  companyId: string | null;
}): Promise<string | null> {
  const fromMeta =
    typeof input.metadata?.userDisplayName === "string"
      ? input.metadata.userDisplayName.trim()
      : typeof input.metadata?.userFullName === "string"
        ? input.metadata.userFullName.trim()
        : "";
  if (fromMeta) {
    return extractFirstName(fromMeta);
  }
  if (input.companyId) {
    const company = await findCompanyById(input.companyId);
    if (company?.contact_name?.trim()) {
      return extractFirstName(company.contact_name);
    }
    if (company?.name?.trim()) {
      return company.name.trim();
    }
  }
  return null;
}

/** Limpia estado operativo activo; conserva historial de mensajes en panel. */
export async function resetAgentConversationStateForGreeting(
  sessionId: string,
  channel: AgentChannel,
  companyId: string,
): Promise<void> {
  await clearSendSmsFlowMemory(sessionId, channel, companyId);
  await updateConversationMemory(
    sessionId,
    channel,
    {
      purchaseFlowStep: undefined,
      pendingPurchaseQuantity: undefined,
      pendingPurchaseQuote: undefined,
      pendingPurchaseOrderId: undefined,
      pendingPaymentUrl: undefined,
      blockedSendDueToBalance: undefined,
      pendingSmsMessage: undefined,
      pendingSmsPhone: undefined,
      pendingCsvUploadId: undefined,
      waitingForMessage: undefined,
      waitingForRecipient: undefined,
      waitingForCsv: undefined,
      sendSmsFlowActive: undefined,
      sendSmsFlowStep: undefined,
      sendSmsDestMode: undefined,
      campaignGuided: undefined,
      campaignDraftStep: undefined,
      campaignDraftMessage: undefined,
      lastPendingConfirmAt: undefined,
      pendingLeadStep: undefined,
      leadPartial: undefined,
      lastIntent: "greeting",
      lastTopic: "greeting",
    },
    companyId,
  );
}

export function buildFreshGreetingResponse(input: {
  sessionId: string;
  displayName: string | null;
  localHour: number;
}): AgentCoreResponse {
  const timePhrase = timeOfDayPhrase(input.localHour);
  const namePart = input.displayName ? `, ${input.displayName}` : "";
  const reply = `${timePhrase}${namePart}. Soy el Agente Telvoice. ¿Qué quieres hacer hoy?`;

  return {
    reply,
    intent: "greeting",
    confidence: 0.98,
    sessionId: input.sessionId,
    suggestedActions: GREETING_QUICK_ACTIONS,
    quote: null,
    requiresConfirmation: false,
    leadRequired: false,
    safeToExecute: true,
    clearCsvUpload: true,
    showAttachButton: false,
    resetFlow: true,
  };
}

export async function handlePureGreetingReset(input: {
  sessionId: string;
  channel: AgentChannel;
  companyId: string;
  metadata?: Record<string, unknown>;
}): Promise<AgentCoreResponse> {
  await cancelAllPendingForSessionDb(input.sessionId, input.companyId);
  await resetAgentConversationStateForGreeting(
    input.sessionId,
    input.channel,
    input.companyId,
  );

  const displayName = await resolveDisplayNameForGreeting({
    metadata: input.metadata,
    companyId: input.companyId,
  });
  const localHour = resolveLocalHour(input.metadata);

  return buildFreshGreetingResponse({
    sessionId: input.sessionId,
    displayName,
    localHour,
  });
}
