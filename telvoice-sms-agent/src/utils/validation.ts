import { env } from "../config/env.js";
import type { SendSmsRequest } from "../types/asmsc.js";
import { ValidationError } from "./errors.js";

const PHONE_PATTERN = /^[0-9]{8,15}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SMS_TYPE_PATTERN = /^[A-Z]$/i;
const ENCODING_PATTERN = /^[TU]$/i;

export interface ValidatedSendTestInput {
  client_id?: string;
  phonenumber: string;
  textmessage: string;
  sender_id: string;
  sms_type: string;
  encoding: string;
}

export function validateSendTestBody(body: unknown): ValidatedSendTestInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("El cuerpo de la solicitud debe ser un objeto JSON.");
  }

  const record = body as Record<string, unknown>;
  const client_id = readOptionalUuid(record, "client_id");
  const phonenumber = readRequiredString(record, "phonenumber");
  const textmessage = readRequiredString(record, "textmessage");
  const sender_id = readRequiredString(record, "sender_id");
  const sms_type = readOptionalSmsType(record, "sms_type");
  const encoding = readOptionalEncoding(record, "encoding");

  if (phonenumber.includes("+")) {
    throw new ValidationError(
      "phonenumber no debe incluir el signo +. Use solo dígitos con código de país (ej. 56912345678).",
    );
  }

  if (!PHONE_PATTERN.test(phonenumber)) {
    throw new ValidationError(
      "phonenumber debe contener entre 8 y 15 dígitos numéricos.",
    );
  }

  if (textmessage.trim().length === 0) {
    throw new ValidationError("textmessage no puede estar vacío.");
  }

  if (sender_id.trim().length === 0) {
    throw new ValidationError("sender_id no puede estar vacío.");
  }

  return {
    client_id,
    phonenumber,
    textmessage: textmessage.trim(),
    sender_id: sender_id.trim(),
    sms_type,
    encoding,
  };
}

export function validateUuidParam(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!UUID_PATTERN.test(trimmed)) {
    throw new ValidationError(`${fieldName} debe ser un UUID válido.`);
  }
  return trimmed;
}

function readOptionalSmsType(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (value === undefined || value === null || value === "") {
    return env.asmsc.defaultSmsType;
  }
  if (typeof value !== "string" || !SMS_TYPE_PATTERN.test(value.trim())) {
    throw new ValidationError(`El campo "${field}" debe ser un carácter válido.`);
  }
  return value.trim().toUpperCase();
}

function readOptionalEncoding(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (value === undefined || value === null || value === "") {
    return "T";
  }
  if (typeof value !== "string" || !ENCODING_PATTERN.test(value.trim())) {
    throw new ValidationError(`El campo "${field}" debe ser T o U.`);
  }
  return value.trim().toUpperCase();
}

function readOptionalUuid(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = record[field];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ValidationError(`El campo "${field}" debe ser texto (UUID).`);
  }
  const trimmed = value.trim();
  if (!UUID_PATTERN.test(trimmed)) {
    throw new ValidationError(`El campo "${field}" debe ser un UUID válido.`);
  }
  return trimmed;
}

export function toSendSmsRequest(
  validated: ValidatedSendTestInput,
  uid: string,
  callbackUrl?: string,
): SendSmsRequest {
  return {
    phonenumber: validated.phonenumber,
    textmessage: validated.textmessage,
    sender_id: validated.sender_id,
    sms_type: validated.sms_type,
    encoding: validated.encoding,
    uid,
    callback_url: callbackUrl,
  };
}

function readRequiredString(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (value === undefined || value === null) {
    throw new ValidationError(`El campo "${field}" es obligatorio.`);
  }
  if (typeof value !== "string") {
    throw new ValidationError(`El campo "${field}" debe ser texto.`);
  }
  return value.trim();
}
