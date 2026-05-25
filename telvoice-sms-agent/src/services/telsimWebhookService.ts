import type { VerifyNumberEntry } from "../config/verifyNumbers.js";
import { env } from "../config/env.js";
import type { TelsimInboundSmsRow, TelsimSmsReceivedPayload } from "../types/telsim.js";
import { AppError } from "../utils/errors.js";
import {
  extractLinePhoneFromTelsimBody,
  normalizeTelsimLinePhone,
} from "../utils/telsim-line-phone.js";
import { verifyTelsimSignature } from "../utils/telsim-signature.js";
import {
  getBoundSlotIdForVerifyPhone,
  getLatestTelsimInboundByLinePhone,
  getLatestTelsimInboundBySlot,
  insertTelsimInboundSms,
  listRecentTelsimInbound,
  listTelsimInboundByLinePhoneAsc,
  listTelsimInboundBySlotAsc,
} from "./telsimInboundService.js";

export type TelsimInboundPreview = {
  content: string;
  verificationCode: string | null;
  receivedAt: string;
  from: string;
  slotId: string | null;
};

export type TelsimInboundFeedItem = {
  id: string;
  content: string;
  from: string;
  receivedAt: string;
  verificationCode: string | null;
};

function rowToFeedItem(row: TelsimInboundSmsRow): TelsimInboundFeedItem {
  return {
    id: row.id,
    content: row.content,
    from: row.sender_from,
    receivedAt: row.received_at,
    verificationCode: row.verification_code,
  };
}

function parsePayload(body: Record<string, unknown>): TelsimSmsReceivedPayload {
  const event = String(body.event ?? "").trim();
  if (event !== "sms.received") {
    throw new AppError(`Evento Telsim no soportado: ${event || "(vacío)"}`, 400);
  }

  const from = String(body.from ?? "").trim();
  const content = String(body.content ?? "").trim();
  const slot_id = String(body.slot_id ?? "").trim();
  const received_at = String(body.received_at ?? "").trim();

  if (!from || !content || !slot_id || !received_at) {
    throw new AppError(
      "Payload Telsim incompleto (from, content, slot_id, received_at requeridos).",
      400,
    );
  }

  const verification_code =
    body.verification_code == null || body.verification_code === ""
      ? null
      : String(body.verification_code);

  return {
    event: "sms.received",
    from,
    content,
    verification_code,
    service: String(body.service ?? "").trim() || "—",
    slot_id,
    received_at,
  };
}

function rowToPreview(row: TelsimInboundSmsRow): TelsimInboundPreview {
  return {
    content: row.content,
    verificationCode: row.verification_code,
    receivedAt: row.received_at,
    from: row.sender_from,
    slotId: row.slot_id,
  };
}

export type TelsimWebhookProcessResult = {
  stored: boolean;
  inbound_id: string | null;
  slot_id: string;
  verification_code: string | null;
  line_phone: string | null;
};

export async function processTelsimSmsWebhook(input: {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
  rawBody?: string;
}): Promise<TelsimWebhookProcessResult> {
  const cfg = env.telsim;
  const signature = headerString(input.headers["x-telsim-signature"]);
  const telsimEvent = headerString(input.headers["x-telsim-event"]);

  if (telsimEvent && telsimEvent !== "sms.received") {
    throw new AppError(`X-Telsim-Event inesperado: ${telsimEvent}`, 400);
  }

  if (!cfg.webhookSecret && !cfg.skipSignatureVerify) {
    throw new AppError("TELSIM_WEBHOOK_SECRET no configurado en el servidor.", 503);
  }

  if (cfg.webhookSecret && !cfg.skipSignatureVerify) {
    const ok = verifyTelsimSignature({
      secret: cfg.webhookSecret,
      signatureHeader: signature,
      body: input.body,
      rawBody: input.rawBody,
    });
    if (!ok) {
      console.warn(
        "[telsim] Firma inválida",
        JSON.stringify({
          hasRawBody: Boolean(input.rawBody?.length),
          event: input.body.event,
          slot_id: input.body.slot_id,
          sigLen: signature?.length ?? 0,
        }),
      );
      throw new AppError("Firma Telsim inválida (X-Telsim-Signature).", 401);
    }
  }

  const payload = parsePayload(input.body);
  const linePhone = extractLinePhoneFromTelsimBody(input.body);
  const row = await insertTelsimInboundSms({
    payload,
    rawPayload: input.body,
    linePhone,
  });

  console.info(
    "[telsim] sms.received",
    JSON.stringify({
      stored: row != null,
      slot_id: payload.slot_id,
      line_phone: row?.line_phone ?? linePhone,
      from: payload.from,
    }),
  );

  return {
    stored: row != null,
    inbound_id: row?.id ?? null,
    slot_id: payload.slot_id,
    verification_code: payload.verification_code,
    line_phone: row?.line_phone ?? linePhone,
  };
}

function resolveTelsimPreviewFromShared(
  entry: VerifyNumberEntry,
  recentInbound: TelsimInboundSmsRow[],
): TelsimInboundPreview | null {
  const targetDigits = normalizeTelsimLinePhone(entry.phone);
  if (!targetDigits) {
    return null;
  }
  for (const row of recentInbound) {
    const linePhone =
      row.line_phone?.trim() ||
      extractLinePhoneFromTelsimBody(
        (row.raw_payload ?? {}) as Record<string, unknown>,
      );
    if (linePhone && normalizeTelsimLinePhone(linePhone) === targetDigits) {
      return rowToPreview(row);
    }
  }
  return null;
}

async function resolveTelsimPreviewForEntry(
  entry: VerifyNumberEntry,
  recentInbound: TelsimInboundSmsRow[],
): Promise<TelsimInboundPreview | null> {
  if (entry.slotId?.trim()) {
    const bySlot = await getLatestTelsimInboundBySlot(entry.slotId.trim());
    if (bySlot) {
      return rowToPreview(bySlot);
    }
  }

  const byLine = await getLatestTelsimInboundByLinePhone(entry.phone);
  if (byLine) {
    return rowToPreview(byLine);
  }

  const boundSlot = await getBoundSlotIdForVerifyPhone(entry.phone);
  if (boundSlot) {
    const byBound = await getLatestTelsimInboundBySlot(boundSlot);
    if (byBound) {
      return rowToPreview(byBound);
    }
  }

  return resolveTelsimPreviewFromShared(entry, recentInbound);
}

/** Último SMS entrante para una línea QA (slot configurado, binding auto o teléfono en payload). */
export async function getTelsimPreviewForVerifyEntry(
  entry: VerifyNumberEntry,
): Promise<TelsimInboundPreview | null> {
  const recent = await listRecentTelsimInbound(40);
  return resolveTelsimPreviewForEntry(entry, recent);
}

/** Previews telsim para todas las líneas QA en una sola pasada (evita N× listRecent). */
export async function getTelsimPreviewsForVerifyEntries(
  entries: VerifyNumberEntry[],
): Promise<Map<string, TelsimInboundPreview | null>> {
  const result = new Map<string, TelsimInboundPreview | null>();
  if (entries.length === 0) {
    return result;
  }

  const recentInbound = await listRecentTelsimInbound(40);
  const previews = await Promise.all(
    entries.map((entry) => resolveTelsimPreviewForEntry(entry, recentInbound)),
  );
  for (let i = 0; i < entries.length; i++) {
    result.set(entries[i]!.id, previews[i] ?? null);
  }
  return result;
}

/** @deprecated Usar getTelsimPreviewForVerifyEntry */
export async function getTelsimPreviewForSlot(
  slotId: string | null | undefined,
): Promise<Omit<TelsimInboundPreview, "from" | "slotId"> | null> {
  if (!slotId?.trim()) {
    return null;
  }
  const row = await getLatestTelsimInboundBySlot(slotId.trim());
  if (!row) {
    return null;
  }
  return {
    content: row.content,
    verificationCode: row.verification_code,
    receivedAt: row.received_at,
  };
}

/** Historial entrante para una línea QA (cronológico, más reciente al final). */
export async function listTelsimInboundFeedForVerifyEntry(
  entry: VerifyNumberEntry,
  limit = 50,
): Promise<TelsimInboundFeedItem[]> {
  const seen = new Set<string>();
  const merged: TelsimInboundSmsRow[] = [];

  const pushRows = (rows: TelsimInboundSmsRow[]) => {
    for (const row of rows) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      merged.push(row);
    }
  };

  if (entry.slotId?.trim()) {
    pushRows(await listTelsimInboundBySlotAsc(entry.slotId.trim(), limit));
  }

  pushRows(await listTelsimInboundByLinePhoneAsc(entry.phone, limit));

  const boundSlot = await getBoundSlotIdForVerifyPhone(entry.phone);
  if (boundSlot && boundSlot !== entry.slotId?.trim()) {
    pushRows(await listTelsimInboundBySlotAsc(boundSlot, limit));
  }

  const targetDigits = normalizeTelsimLinePhone(entry.phone);
  if (targetDigits) {
    const recent = await listRecentTelsimInbound(80);
    for (const row of recent) {
      const linePhone =
        row.line_phone?.trim() ||
        extractLinePhoneFromTelsimBody(
          (row.raw_payload ?? {}) as Record<string, unknown>,
        );
      if (
        linePhone &&
        normalizeTelsimLinePhone(linePhone) === targetDigits
      ) {
        pushRows([row]);
      } else if (entry.slotId?.trim() && row.slot_id === entry.slotId.trim()) {
        pushRows([row]);
      }
    }
  }

  merged.sort(
    (a, b) =>
      new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
  );

  return merged.slice(-limit).map(rowToFeedItem);
}

export type TelsimVerifyLinePollPayload = {
  previewMessage: string;
  previewSender: string;
  inboundAt: string | null;
  inboundCode: string | null;
  ready: boolean;
  inboundMessages: TelsimInboundFeedItem[];
  latestInboundId: string | null;
};

export async function buildTelsimVerifyLinesPreview(
  entries: VerifyNumberEntry[],
): Promise<Record<string, TelsimVerifyLinePollPayload>> {
  const out: Record<string, TelsimVerifyLinePollPayload> = {};

  await Promise.all(
    entries.map(async (entry) => {
      const inboundMessages = await listTelsimInboundFeedForVerifyEntry(entry);
      const latest = inboundMessages[inboundMessages.length - 1] ?? null;
      const previewMessage = latest
        ? latest.content.trim() ||
          (latest.verificationCode ? `Código: ${latest.verificationCode}` : "")
        : "";
      out[entry.id] = {
        previewMessage,
        previewSender: latest?.from?.trim() || "SMS entrante",
        inboundAt: latest?.receivedAt ?? null,
        inboundCode: latest?.verificationCode ?? null,
        ready: inboundMessages.length > 0,
        inboundMessages,
        latestInboundId: latest?.id ?? null,
      };
    }),
  );

  return out;
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" ? value.trim() : undefined;
}
