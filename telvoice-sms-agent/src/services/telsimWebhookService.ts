import { env } from "../config/env.js";
import type { TelsimSmsReceivedPayload } from "../types/telsim.js";
import { AppError } from "../utils/errors.js";
import { verifyTelsimSignature } from "../utils/telsim-signature.js";
import {
  getLatestTelsimInboundBySlot,
  insertTelsimInboundSms,
} from "./telsimInboundService.js";

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

export type TelsimWebhookProcessResult = {
  stored: boolean;
  inbound_id: string | null;
  slot_id: string;
  verification_code: string | null;
};

export async function processTelsimSmsWebhook(input: {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
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
    });
    if (!ok) {
      throw new AppError("Firma Telsim inválida (X-Telsim-Signature).", 401);
    }
  }

  const payload = parsePayload(input.body);
  const row = await insertTelsimInboundSms({
    payload,
    rawPayload: input.body,
  });

  return {
    stored: row != null,
    inbound_id: row?.id ?? null,
    slot_id: payload.slot_id,
    verification_code: payload.verification_code,
  };
}

export async function getTelsimPreviewForSlot(
  slotId: string | null | undefined,
): Promise<{ content: string; verificationCode: string | null; receivedAt: string } | null> {
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

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" ? value.trim() : undefined;
}
