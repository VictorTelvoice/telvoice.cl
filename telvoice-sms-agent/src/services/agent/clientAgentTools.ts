import { getSupabase } from "../../database/supabaseClient.js";
import { createQuickQuote, extractSmsQuantityFromText } from "../commercialQuoteService.js";
import { listCampaignsByCompany, createSmsCampaign } from "../smsCampaignService.js";
import { getCompanyBalance } from "../smsWalletService.js";
import { calculateSmsSegments } from "../smsSegmentService.js";
import { listContactLists } from "../contactService.js";
import { isMercadoPagoConfigured } from "../../config/env.js";
import { formatClp } from "../../utils/clp-format.js";
import { isMissingTableError } from "../../utils/db-table.js";
import type { PanelSmsMessageRow } from "../../types/sms-panel.js";

export async function toolGetBalance(companyId: string): Promise<string> {
  const balance = await getCompanyBalance(companyId);
  return (
    `Tu saldo SMS disponible es **${balance.availableSms.toLocaleString("es-CL")}** unidades.\n` +
    `Reservado: ${balance.reservedSms.toLocaleString("es-CL")} · ` +
    `Consumido histórico: ${balance.consumedSms.toLocaleString("es-CL")} · ` +
    `Estado wallet: ${balance.status}.`
  );
}

export async function toolListRecentMessages(
  companyId: string,
  limit = 5,
): Promise<string> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select(
      "recipient_number, status, mode, cost_sms, created_at, message, provider_message_id",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return "Aún no hay mensajes registrados en tu bandeja.";
    }
    throw error;
  }

  const rows = (data ?? []) as PanelSmsMessageRow[];
  if (!rows.length) {
    return "No tienes envíos recientes en la bandeja.";
  }

  const lines = rows.map((m, i) => {
    const when = new Date(m.created_at).toLocaleString("es-CL");
    const preview =
      m.message.length > 42 ? `${m.message.slice(0, 42)}…` : m.message;
    return (
      `${i + 1}. ${when} → ${m.recipient_number} · ${m.status.toUpperCase()} (${m.mode}) · ` +
      `${m.cost_sms} SMS · «${preview}»`
    );
  });

  return `Últimos ${rows.length} envíos:\n\n${lines.join("\n")}\n\nVer más en /app/inbox.`;
}

export async function toolListRecentCampaigns(
  companyId: string,
  limit = 5,
): Promise<string> {
  const campaigns = await listCampaignsByCompany(companyId, limit);
  if (!campaigns.length) {
    return "No tienes campañas registradas. Puedes crear una en /app/campaigns/new.";
  }

  const lines = campaigns.map((c, i) => {
    const when = c.created_at
      ? new Date(c.created_at).toLocaleString("es-CL")
      : "—";
    return (
      `${i + 1}. ${c.name} · ${c.status} · ${c.valid_recipients ?? 0} contactos válidos · ` +
      `costo est. ${c.estimated_sms_cost ?? 0} SMS · ${when}`
    );
  });

  return `Últimas campañas:\n\n${lines.join("\n")}\n\nGestión completa en /app/campaigns.`;
}

export async function toolQuotePurchase(text: string): Promise<string> {
  const qty = extractSmsQuantityFromText(text);
  if (!qty) {
    return (
      "Indica cuántos SMS quieres cotizar en múltiplos de 1.000 (mínimo 1.000).\n" +
      "Ejemplo: «quiero comprar 30000 SMS»."
    );
  }

  const quote = await createQuickQuote(qty);
  const lines = [
    `Cotización para ${quote.quoted_quantity.toLocaleString("es-CL")} SMS (Chile):`,
    `Tramo: ${quote.tier_label}`,
    `Precio: $${quote.unit_price} + IVA por SMS`,
    `Subtotal: ${formatClp(quote.subtotal)} + IVA`,
    `IVA 19%: ${formatClp(quote.iva)}`,
    `Total con IVA: ${formatClp(quote.total_with_iva)}`,
  ];

  if (quote.was_rounded && quote.requested_quantity !== quote.quoted_quantity) {
    lines.unshift(
      `Cantidad solicitada: ${quote.requested_quantity.toLocaleString("es-CL")} SMS`,
      `Cantidad cotizada (múltiplo de 1.000): ${quote.quoted_quantity.toLocaleString("es-CL")} SMS`,
      "",
    );
  }

  lines.push(
    "",
    "Puedes comprar bolsas en /app/buy-sms" +
      (isMercadoPagoConfigured() ? " o pedirme que prepare el pago." : "."),
  );

  return lines.join("\n");
}

export function toolAnalyzeSegments(message: string): string {
  const seg = calculateSmsSegments(message);
  if (!seg.characters) {
    return "Escribe el mensaje que quieres analizar y te indico segmentos y costo.";
  }

  return (
    `Análisis del mensaje:\n` +
    `• Caracteres: ${seg.characters}\n` +
    `• Codificación: ${seg.encoding}\n` +
    `• Segmentos: ${seg.segments}\n` +
    `• Costo estimado: ${seg.costSms} SMS por destinatario\n\n` +
    (seg.segments > 1
      ? "Tip: acorta el texto o evita caracteres especiales para bajar a 1 segmento GSM-7."
      : "Tu mensaje cabe en 1 segmento. Buen trabajo.")
  );
}

export function toolSuggestCopy(message: string): string {
  const seg = calculateSmsSegments(message);
  const tips: string[] = [];

  if (seg.encoding === "UCS-2") {
    tips.push(
      "Tu mensaje usa caracteres fuera de GSM-7 (tildes raras, emojis, etc.). Simplifica acentos o elimina símbolos para ahorrar segmentos.",
    );
  }
  if (seg.segments > 1) {
    tips.push(
      `Hoy son ${seg.segments} segmentos. Intenta bajar de ${seg.characters} a ≤160 caracteres GSM-7 para 1 solo SMS.`,
    );
  }
  if (/\b(click aqui|haz click|www\.)/i.test(message)) {
    tips.push("Usa un enlace corto y deja claro quién envía el SMS (marca + motivo).");
  }
  if (message.length > 140) {
    tips.push("Prueba una versión más directa: saludo + beneficio + CTA en una línea.");
  }
  if (!tips.length) {
    tips.push(
      "El copy está compacto. Asegura CTA claro y remitente reconocible (Sender ID aprobado).",
    );
  }

  return `Sugerencias para tu SMS:\n\n${tips.map((t) => `• ${t}`).join("\n")}`;
}

export async function toolContactListStats(
  companyId: string,
  listHint: string,
): Promise<string> {
  const lists = await listContactLists(companyId);
  if (!lists.length) {
    return "No tienes listas de contactos. Crea una en /app/contacts.";
  }

  const needle = listHint.trim().toLowerCase();
  const match =
    lists.find((l) => l.name.toLowerCase() === needle) ??
    lists.find((l) => l.name.toLowerCase().includes(needle));

  if (!match) {
    const names = lists.map((l) => `• ${l.name} (${l.contacts_count} contactos)`).join("\n");
    return `No encontré una lista llamada «${listHint}». Tus listas:\n\n${names}`;
  }

  return (
    `Lista «${match.name}»: ${match.contacts_count.toLocaleString("es-CL")} contactos activos.\n` +
    `Para enviar, crea una campaña en /app/campaigns/new y selecciona esta lista.`
  );
}

export async function toolEstimateCampaignCost(
  companyId: string,
  text: string,
): Promise<string> {
  const lists = await listContactLists(companyId);
  const listMatch = lists.find((l) =>
    text.toLowerCase().includes(l.name.toLowerCase()),
  );

  const messageMatch = text.match(/mensaje[:\s]+(.+)/i);
  const sampleMessage = messageMatch?.[1]?.trim() ?? "Hola, mensaje de prueba Telvoice.";
  const seg = calculateSmsSegments(sampleMessage);
  const perRecipient = seg.costSms;

  if (!listMatch) {
    const names = lists
      .slice(0, 8)
      .map((l) => `• ${l.name}: ${l.contacts_count} × ${perRecipient} = ${l.contacts_count * perRecipient} SMS`)
      .join("\n");
    return (
      `Costo por destinatario (mensaje ejemplo, ${seg.segments} seg.): ${perRecipient} SMS.\n\n` +
      `Indica el nombre de tu lista. Referencia:\n${names || "Sin listas aún."}`
    );
  }

  const total = listMatch.contacts_count * perRecipient;
  const balance = await getCompanyBalance(companyId);
  const ok = balance.availableSms >= total;

  return (
    `Estimación campaña «${listMatch.name}»:\n` +
    `• Contactos: ${listMatch.contacts_count.toLocaleString("es-CL")}\n` +
    `• Segmentos por SMS: ${seg.segments} (${seg.encoding})\n` +
    `• Costo estimado: **${total.toLocaleString("es-CL")} SMS**\n` +
    `• Tu saldo: ${balance.availableSms.toLocaleString("es-CL")} SMS\n` +
    (ok
      ? "✓ Saldo suficiente para este envío (antes de confirmar en el panel)."
      : "⚠ Saldo insuficiente. Compra más SMS en /app/buy-sms antes de lanzar.")
  );
}

export async function toolCreateCampaignDraft(input: {
  companyId: string;
  userId: string | null;
  name: string;
  message: string;
  senderId?: string;
}): Promise<{ campaignId: string; reply: string }> {
  const seg = calculateSmsSegments(input.message);
  const campaign = await createSmsCampaign({
    companyId: input.companyId,
    name: input.name,
    message: input.message,
    senderId: input.senderId ?? "TELVOICE",
    status: "draft",
    estimatedSmsCost: seg.costSms,
    createdBy: input.userId,
    metadata: { source: "panel_agent", draft: true },
  });

  return {
    campaignId: campaign.id,
    reply:
      `Borrador de campaña creado: «${campaign.name}».\n` +
      `ID: ${campaign.id}\n` +
      `Segmentos estimados por destinatario: ${seg.segments}\n` +
      `Continúa en /app/campaigns/${campaign.id} para elegir lista y enviar.`,
  };
}

export function toolDlrHelp(): string {
  return (
    "Estados DLR más comunes en tu bandeja:\n\n" +
    "• **queued / pending**: en cola interna.\n" +
    "• **sent / submitted**: el proveedor aceptó el SMS.\n" +
    "• **delivered**: entregado al teléfono (DLR OK).\n" +
    "• **failed**: no entregado; revisa número, contenido o bloqueo del operador.\n\n" +
    "Si ves «submitted» mucho tiempo, espera hasta 2 minutos. Si persiste, abre /app/support."
  );
}

export function toolCapabilities(): string {
  return (
    "Soy el asistente **telvoice** de tu panel. Puedo ayudarte con:\n\n" +
    "• Consultar saldo y últimos envíos\n" +
    "• Cotizar compra de SMS (tramos Telvoice.cl)\n" +
    "• Explicar DLR y estados\n" +
    "• Analizar segmentos y mejorar tu copy\n" +
    "• Estimar costo de campaña por lista\n" +
    "• Crear borradores de campaña\n" +
    "• Preparar envíos **solo con tu confirmación explícita**\n\n" +
    "No puedo cambiar rutas, proveedores ni configuración técnica."
  );
}
