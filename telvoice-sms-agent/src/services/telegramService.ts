import { env } from "../config/env.js";
import { telegramClient } from "../providers/telegram/index.js";
import type { TelegramMessage, TelegramUpdate } from "../types/telegram.js";
import { parseAsmscBalanceSummary } from "../utils/asmsc-balance-summary.js";
import { getAsmscRemarksHint, isProviderStatusFailed } from "../utils/asmsc-hints.js";
import { AppError, ValidationError } from "../utils/errors.js";
import { getBalanceByClientId } from "./balanceService.js";
import {
  fetchAsmscBalance,
  sendTestSms,
} from "./sms.service.js";
import {
  listRecentMessagesByClientId,
} from "./smsMessageService.js";
import {
  clearPendingConfirmation,
  generateConfirmationCode,
  getPendingConfirmation,
  setPendingConfirmation,
} from "./telegram/pendingConfirmations.js";
import { getAuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import type { AuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import { continueCommercialConversation } from "./telegramCommercialContext.js";
import {
  continueLeadCapture,
  handleCommercialText,
} from "./telegramCommercialService.js";
import { buildTelegramCapabilitiesMessage } from "./telegramCapabilities.js";
import {
  buildHumanGreetingMessage,
  isCasualGreetingOnly,
} from "./telegramGreetingService.js";
import {
  buildKnowledgeReplySafe,
  classifyTelegramIntent,
} from "./telegramIntentService.js";
import {
  answerBuscarCommand,
  extractBuscarQuery,
} from "./telegramKnowledge.js";
import {
  setTelegramLastError,
} from "./telegram/runtime.js";

const UNAUTHORIZED_MSG =
  "No estás autorizado para operar este bot. Contacta al administrador Telvoice.";

const PUBLIC_START_MSG = `Bienvenido al asesor Telvoice.cl 🇨🇱

Vendemos bolsas de SMS masivos para empresas en Chile.
Cobertura: Entel, Movistar, Claro y WOM.
Pago online con MercadoPago.

Comandos comerciales:
• planes / precios / bolsas
• cotizar 15000 sms
• comprar sms

Preguntas: qué es una bolsa de SMS, operadores, factura, API, etc.

Saldo, historial y envío SMS requieren usuario autorizado en tu empresa.`;

const OPERATIONAL_REQUIRES_AUTH_MSG =
  "Esa función requiere usuario autorizado en Telvoice SMS Agent.\n\nPuedes consultar planes, precios y cotizaciones comerciales.\nEjemplo: planes o cotizar 10000 sms";

const PHONE_PATTERN = /^[0-9]{8,15}$/;
const DEFAULT_SENDER =
  env.asmsc.defaultSenderId?.trim() || "TELVOICE";

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

function requireClient(): NonNullable<typeof telegramClient> {
  if (!telegramClient) {
    throw new AppError(
      "TELEGRAM_BOT_TOKEN no configurado.",
      503,
      "TELEGRAM_NOT_CONFIGURED",
    );
  }
  return telegramClient;
}

async function reply(chatId: number, text: string): Promise<void> {
  const client = requireClient();
  await client.sendMessage(chatId, text);
}

function stripBotSuffix(token: string): string {
  return token.replace(/@\w+$/i, "");
}

function normalizeCommandToken(text: string): string {
  const first = stripBotSuffix(text.split(/\s+/)[0] ?? "").toLowerCase();
  if (first.startsWith("/")) {
    return first;
  }
  return COMMAND_ALIASES[first] ?? `/${first}`;
}

function shortUid(uid: string): string {
  if (uid.length <= 12) {
    return uid;
  }
  return `${uid.slice(0, 8)}…`;
}

async function resolveAuth(
  userId: number,
): Promise<AuthorizedTelegramClient | null> {
  if (!env.supabase.url || !env.supabase.serviceRoleKey) {
    console.warn("[telegram] Supabase no configurado — no se puede autorizar por BD.");
    return null;
  }
  try {
    return await getAuthorizedTelegramClient(userId);
  } catch (error) {
    console.error("[telegram] Error consultando autorización:", error);
    return null;
  }
}

export async function processTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text || !message.from) {
    return;
  }

  try {
    await handleTelegramMessage(message);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error procesando mensaje";
    setTelegramLastError(msg);
    console.error("[telegram] Error procesando update:", error);
    try {
      await reply(
        message.chat.id,
        "Ocurrió un error interno. Intenta de nuevo o contacta al administrador.",
      );
    } catch {
      /* ignore secondary failure */
    }
  }
}

async function handleTelegramMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = message.from!.id;
  const text = message.text!.trim();

  console.info("[telegram] Mensaje recibido", {
    userId,
    chatId,
    preview: text.slice(0, 80),
  });

  const upper = text.toUpperCase();

  if (upper === "CANCELAR") {
    const auth = await resolveAuth(userId);
    if (!auth) {
      await reply(chatId, UNAUTHORIZED_MSG);
      return;
    }
    const had = clearPendingConfirmation(userId);
    await reply(chatId, had ? "Envío cancelado." : "No hay envío pendiente.");
    return;
  }

  const confirmMatch = /^CONFIRMAR\s+(\d{4})$/i.exec(text);
  if (confirmMatch?.[1]) {
    const auth = await resolveAuth(userId);
    if (!auth) {
      await reply(chatId, UNAUTHORIZED_MSG);
      return;
    }
    await handleConfirm(userId, chatId, confirmMatch[1], auth);
    return;
  }

  const command = normalizeCommandToken(text);

  if (command === "/start") {
    await handleStart(chatId, userId);
    return;
  }

  const leadReply = await continueLeadCapture(userId, chatId, text);
  if (leadReply !== null) {
    await reply(chatId, leadReply);
    return;
  }

  const authForThread = await resolveAuth(userId);

  const commercialThreadReply = await continueCommercialConversation(
    userId,
    chatId,
    text,
    authForThread,
  );
  if (commercialThreadReply !== null) {
    await reply(chatId, commercialThreadReply);
    return;
  }

  const buscarQuery = extractBuscarQuery(text);
  if (buscarQuery !== null || command === "/buscar") {
    const authBuscar = await resolveAuth(userId);
    if (!authBuscar) {
      await reply(chatId, OPERATIONAL_REQUIRES_AUTH_MSG);
      return;
    }
    if (!buscarQuery) {
      await reply(
        chatId,
        "Uso: buscar tema\nEjemplo: buscar dlr localhost",
      );
      return;
    }
    await handleBuscar(chatId, buscarQuery);
    return;
  }

  const auth = await resolveAuth(userId);
  const telegramFirstName = message.from?.first_name;
  await handleFreeTextByIntent(
    chatId,
    userId,
    text,
    command,
    auth,
    telegramFirstName,
  );
}

async function handleFreeTextByIntent(
  chatId: number,
  userId: number,
  text: string,
  command: string,
  auth: AuthorizedTelegramClient | null,
  telegramFirstName?: string,
): Promise<void> {
  if (isCasualGreetingOnly(text)) {
    await reply(
      chatId,
      buildHumanGreetingMessage(auth, telegramFirstName),
    );
    return;
  }

  const classification = classifyTelegramIntent(text, command);

  console.info("[telegram] Intención", {
    preview: text.slice(0, 60),
    route: classification.route,
    commercial: classification.commercial?.kind ?? null,
    op: classification.operationalCommand,
  });

  const op = classification.operationalCommand;

  if (op === "ayuda") {
    await handleAyuda(chatId, !!auth);
    return;
  }

  if (op === "planes" || op === "precios" || op === "bolsas") {
    const answer = await handleCommercialText(text, auth, { userId, chatId });
    await reply(chatId, answer ?? "Error al consultar planes Telvoice.cl.");
    return;
  }

  const needsAuth = op === "saldo" || op === "historial" || op === "enviar";
  if (needsAuth && !auth) {
    await reply(chatId, OPERATIONAL_REQUIRES_AUTH_MSG);
    return;
  }

  if (auth && op === "saldo") {
    await handleSaldo(chatId, auth);
    return;
  }
  if (auth && op === "historial") {
    await handleHistorial(chatId, auth);
    return;
  }
  if (auth && op === "enviar") {
    await handleEnviar(chatId, userId, text, auth);
    return;
  }

  if (classification.route === "commercial") {
    try {
      const answer = await handleCommercialText(text, auth, { userId, chatId });
      await reply(chatId, answer ?? COMMERCIAL_FALLBACK_MSG);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error);
      console.error("[telegram] Error comercial:", msg, error);
      await reply(
        chatId,
        `No pude completar la cotización en este momento.\n\nDetalle técnico: ${msg}\n\nIntenta de nuevo con: cotizar 30000 sms`,
      );
    }
    return;
  }

  if (classification.route === "knowledge") {
    await handleKnowledgeQuestion(chatId, text);
    return;
  }

  if (classification.route === "capabilities") {
    await reply(chatId, buildTelegramCapabilitiesMessage(!!auth));
    return;
  }

  const commercialRetry = await handleCommercialText(text, auth, {
    userId,
    chatId,
  });
  if (commercialRetry) {
    await reply(chatId, commercialRetry);
    return;
  }

  if (classification.route === "fallback") {
    const answer = await buildKnowledgeReplySafe(text);
    await reply(chatId, answer);
    return;
  }

  await reply(chatId, auth ? "No entendí tu mensaje. Escribe /ayuda." : PUBLIC_START_MSG);
}

const COMMERCIAL_FALLBACK_MSG =
  "Puedo ayudarte a comprar bolsas SMS para Chile. Escribe: quiero comprar sms o cotizar 30000 sms";

async function handleStart(chatId: number, userId: number): Promise<void> {
  const auth = await resolveAuth(userId);
  if (!auth) {
    await reply(chatId, PUBLIC_START_MSG);
    return;
  }

  await reply(
    chatId,
    `Telvoice SMS Agent activo.
Tu usuario Telegram está autorizado para: ${auth.client.company_name}.

Operación:
/saldo
/historial
/enviar 569XXXXXXXX mensaje
/buscar tema

Comercial Telvoice.cl:
/planes · /precios · cotizar 15000 sms

Soporte: qué significa submitted, DLR, failed, etc.
/ayuda`,
  );
}

async function handleAyuda(chatId: number, authorized: boolean): Promise<void> {
  if (!authorized) {
    await reply(chatId, PUBLIC_START_MSG);
    return;
  }

  await reply(
    chatId,
    `Ayuda Telvoice SMS Agent

Operación (autorizado):
/saldo — balance interno y aSMSC
/historial — últimos SMS
/enviar 569XXXXXXXX mensaje — CONFIRMAR código
/buscar tema — base técnica Telvoice

Comercial Telvoice.cl:
/planes /precios /bolsas
cotizar 100000 sms · comprar sms

Soporte técnico:
• submitted, delivered, failed, DLR, IP whitelist

Envío: número solo dígitos, tipo P, CONFIRMAR / CANCELAR`,
  );
}

async function handleKnowledgeQuestion(
  chatId: number,
  text: string,
): Promise<void> {
  try {
    const answer = await buildKnowledgeReplySafe(text);
    await reply(chatId, answer);
  } catch (error) {
    console.error("[telegram] Error en base de conocimiento:", error);
    await reply(
      chatId,
      "No pude consultar la base de conocimiento. Verifica que la tabla knowledge_articles exista en Supabase.",
    );
  }
}

async function handleBuscar(chatId: number, query: string): Promise<void> {
  try {
    const answer = await answerBuscarCommand(query);
    await reply(chatId, answer);
  } catch (error) {
    console.error("[telegram] Error en /buscar:", error);
    await reply(
      chatId,
      "Error al buscar en la base Telvoice. Contacta al administrador.",
    );
  }
}

async function handleSaldo(
  chatId: number,
  auth: AuthorizedTelegramClient,
): Promise<void> {
  const lines: string[] = [
    "Saldo Telvoice SMS Agent",
    "",
    `Cliente: ${auth.client.company_name}`,
    "",
  ];

  try {
    const balance = await getBalanceByClientId(auth.client.id, "CL");

    if (balance) {
      lines.push(
        "Balance interno CL:",
        `• Disponible: ${balance.available_units}`,
        `• Reservado: ${balance.reserved_units}`,
        `• Consumido: ${balance.consumed_units}`,
      );
    } else {
      lines.push("Balance interno CL: sin registro.");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    lines.push(`Balance interno CL: error — ${msg}`);
  }

  lines.push("");

  if (env.asmsc.apiId && env.asmsc.apiPassword) {
    try {
      const provider = await fetchAsmscBalance();
      const summary = parseAsmscBalanceSummary(provider);
      if (summary.error) {
        lines.push(`Balance técnico aSMSC: ${summary.error}`);
      } else {
        lines.push(
          "Balance técnico aSMSC:",
          `• Monto: ${summary.balanceAmount ?? "—"}`,
          `• Moneda: ${summary.currencyCode ?? "—"}`,
        );
        if (summary.providerMessage) {
          lines.push(`• Mensaje: ${summary.providerMessage}`);
        }
      }
    } catch (error) {
      const msg =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Error al consultar aSMSC";
      lines.push(`Balance técnico aSMSC: ${msg}`);
    }
  } else {
    lines.push("Balance técnico aSMSC: credenciales no configuradas.");
  }

  await reply(chatId, lines.join("\n"));
}

async function handleHistorial(
  chatId: number,
  auth: AuthorizedTelegramClient,
): Promise<void> {
  const messages = await listRecentMessagesByClientId(auth.client.id, 5);

  if (messages.length === 0) {
    await reply(chatId, "No hay SMS registrados para este cliente.");
    return;
  }

  const lines = [`Últimos SMS (${auth.client.company_name}):`, ""];
  for (const m of messages) {
    lines.push(
      `• ${shortUid(m.uid)}`,
      `  Estado: ${m.status} | Destino: ${m.phonenumber}`,
      `  Prov: ${m.provider_status ?? "—"} | DLR: ${m.dlr_status ?? "—"}`,
      `  Fecha: ${new Date(m.created_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}`,
      "",
    );
  }

  await reply(chatId, lines.join("\n").trim());
}

async function handleEnviar(
  chatId: number,
  userId: number,
  text: string,
  _auth: AuthorizedTelegramClient,
): Promise<void> {
  const match = /^(?:\/)?enviar(?:@\w+)?\s+(\d{8,15})\s+([\s\S]+)$/i.exec(text);

  if (!match) {
    await reply(
      chatId,
      `Formato incorrecto.

Usa:
/enviar 569XXXXXXXX Mensaje de prueba
o
enviar 569XXXXXXXX Mensaje de prueba

Número solo dígitos, sin +.`,
    );
    return;
  }

  const phonenumber = match[1] ?? "";
  const textmessage = (match[2] ?? "").trim();

  if (!PHONE_PATTERN.test(phonenumber)) {
    await reply(
      chatId,
      "Número inválido. Usa solo dígitos con código de país (ej. 56912345678), sin +.",
    );
    return;
  }

  if (textmessage.length === 0) {
    await reply(chatId, "El mensaje no puede estar vacío.");
    return;
  }

  const code = generateConfirmationCode();

  setPendingConfirmation({
    telegram_user_id: userId,
    chat_id: chatId,
    phonenumber,
    textmessage,
    sender_id: DEFAULT_SENDER,
    sms_type: "P",
    encoding: "T",
    confirmation_code: code,
    created_at: Date.now(),
  });

  await reply(
    chatId,
    `Resumen de envío

Destino: ${phonenumber}
Mensaje: ${textmessage}
Sender: ${DEFAULT_SENDER}
Tipo: P

Para confirmar escribe:
CONFIRMAR ${code}

Para cancelar:
CANCELAR

(Válido 5 minutos)`,
  );
}

async function handleConfirm(
  userId: number,
  chatId: number,
  code: string,
  _auth: AuthorizedTelegramClient,
): Promise<void> {
  const pending = getPendingConfirmation(userId);

  if (!pending) {
    await reply(
      chatId,
      "No hay confirmación pendiente o expiró. Usa /enviar de nuevo.",
    );
    return;
  }

  if (pending.confirmation_code !== code) {
    await reply(chatId, "Código incorrecto. Revisa el código de CONFIRMAR.");
    return;
  }

  clearPendingConfirmation(userId);

  try {
    const result = await sendTestSms({
      phonenumber: pending.phonenumber,
      textmessage: pending.textmessage,
      sender_id: pending.sender_id,
      sms_type: pending.sms_type,
      encoding: pending.encoding,
    });

    const failed =
      isProviderStatusFailed(result.provider_status) ||
      result.status === "failed";

    const lines = [
      `UID: ${result.uid}`,
      `Provider status: ${result.provider_status ?? "—"}`,
      `Provider message ID: ${result.provider_message_id ?? "—"}`,
      `Remarks: ${result.remarks ?? "—"}`,
    ];

    if (failed) {
      lines.unshift("El proveedor rechazó el SMS.");
    } else if (result.provider_status?.toUpperCase() === "S") {
      lines.unshift("SMS enviado a proveedor. Estado: submitted.");
    } else {
      lines.unshift("SMS enviado a proveedor.");
    }

    const hint = getAsmscRemarksHint(result.remarks);
    if (hint) {
      lines.push("", hint);
    }

    await reply(chatId, lines.join("\n"));
  } catch (error) {
    const msg =
      error instanceof ValidationError || error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error al enviar SMS";
    await reply(chatId, `No se pudo enviar el SMS.\n\n${msg}`);
  }
}
