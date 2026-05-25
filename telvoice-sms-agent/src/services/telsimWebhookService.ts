import type { VerifyNumberEntry } from "../config/verifyNumbers.js";
import { env } from "../config/env.js";
import type { TelsimInboundSmsRow, TelsimSmsReceivedPayload } from "../types/telsim.js";
import { AppError } from "../utils/errors.js";
import { extractLinePhoneFromTelsimBody, normalizeTelsimLinePhone } from "../utils/telsim-line-phone.js";
import { verifyTelsimSignature } from "../utils/telsim-signature.js";
import {
  getBoundSlotIdForVerifyPhone,
  getLatestTelsimInboundByLinePhone,
  getLatestTelsimInboundBySlot,
  insertTelsimInboundSms,
  listRecentTelsimInbound,
} from "./telsimInboundService.js";

export type TelsimInboundPreview = {
  content: string;
  verificationCode: string | null;
  receivedAt: string;
  from: string;
  slotId: string | null;
};

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

  return {
    stored: row != null,
    inbound_id: row?.id ?? null,
    slot_id: payload.slot_id,
    verification_code: payload.verification_code,
    line_phone: row?.line_phone ?? linePhone,
  };
}

/** Último SMS entrante para una línea QA (slot configurado, binding auto o teléfono en payload). */
export async function getTelsimPreviewForVerifyEntry(
  entry: VerifyNumberEntry,
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

  const targetDigits = normalizeTelsimLinePhone(entry.phone);
  if (targetDigits) {
    const recent = await listRecentTelsimInbound(40);
    for (const row of recent) {
      const linePhone =
        row.line_phone?.trim() ||
        extractLinePhoneFromTelsimBody(
          (row.raw_payload ?? {}) as Record<string, unknown>,
        );
      if (linePhone && normalizeTelsimLinePhone(linePhone) === targetDigits) {
        return rowToPreview(row);
      }
    }
  }

  return null;
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

export async function buildTelsimVerifyLinesPreview(
  entries: VerifyNumberEntry[],
): Promise<
  Record<
    string,
    {
      previewMessage: string;
      previewSender: string;
      inboundAt: string | null;
      inboundCode: string | null;
      ready: boolean;
    }
  >
> {
  const out: Record<
    string,
    {
      previewMessage: string;
      previewSender: string;
      inboundAt: string | null;
      inboundCode: string | null;
      ready: boolean;
    }
  > = {};

  await Promise.all(
    entries.map(async (entry) => {
      const inbound = await getTelsimPreviewForVerifyEntry(entry);
      const previewMessage = inbound
        ? inbound.content.trim() ||
          (inbound.verificationCode ? `Código: ${inbound.verificationCode}` : "")
        : "";
      out[entry.id] = {
        previewMessage,
        previewSender: inbound?.from?.trim() || "SMS entrante",
        inboundAt: inbound?.receivedAt ?? null,
        inboundCode: inbound?.verificationCode ?? null,
        ready: Boolean(previewMessage.length > 0),
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
