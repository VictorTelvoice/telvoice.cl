import type { Request, Response } from "express";
import { getPublicApiRequestId } from "../middleware/public-api-request-context.js";
import { recordPublicApiRequest } from "../middleware/public-api-request-log.js";
import {
  getSmsApiMessagesModuleState,
  resolveSandboxSmsSend,
  validateIdempotencyKeyHeader,
  validateSmsApiSendPayload,
} from "../services/smsApiMessageService.js";
import type { SmsApiMessage } from "../types/sms-api-messages.js";
import { publicApiError } from "../utils/public-api-response.js";

const SEND_ENDPOINT = "/api/v1/sms/send";

function logSmsSend(
  req: Request,
  params: {
    statusCode: number;
    success: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  },
): void {
  const auth = req.apiKeyAuth;
  recordPublicApiRequest({
    req,
    endpoint: SEND_ENDPOINT,
    method: "POST",
    statusCode: params.statusCode,
    success: params.success,
    companyId: auth?.companyId ?? null,
    apiKeyId: auth?.apiKeyId ?? null,
    environment: auth?.environment ?? null,
    errorCode: params.errorCode ?? null,
    errorMessage: params.errorMessage ?? null,
    metadata: params.metadata,
  });
}

function messageBody(message: SmsApiMessage) {
  return {
    id: message.id,
    status: message.status,
    to: message.recipient,
    sender: message.sender,
    segments: message.segments,
    cost_sms: message.costSms,
    environment: message.environment,
  };
}

export async function postPublicApiSmsSend(
  req: Request,
  res: Response,
): Promise<void> {
  const requestId = getPublicApiRequestId(req);
  const auth = req.apiKeyAuth;

  if (!auth) {
    logSmsSend(req, {
      statusCode: 500,
      success: false,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "An internal error occurred.",
    });
    publicApiError(
      res,
      500,
      requestId,
      "INTERNAL_ERROR",
      "An internal error occurred.",
    );
    return;
  }

  if (auth.environment === "production") {
    logSmsSend(req, {
      statusCode: 403,
      success: false,
      errorCode: "PRODUCTION_SEND_NOT_ENABLED",
      errorMessage: "Production SMS send is not enabled yet.",
    });
    publicApiError(
      res,
      403,
      requestId,
      "PRODUCTION_SEND_NOT_ENABLED",
      "Production SMS send is not enabled yet.",
    );
    return;
  }

  const idempotency = validateIdempotencyKeyHeader(req.headers["idempotency-key"]);
  if (!idempotency.ok) {
    logSmsSend(req, {
      statusCode: idempotency.error.statusCode,
      success: false,
      errorCode: idempotency.error.code,
      errorMessage: idempotency.error.message,
      metadata: { idempotency_key_present: true },
    });
    publicApiError(
      res,
      idempotency.error.statusCode,
      requestId,
      idempotency.error.code,
      idempotency.error.message,
    );
    return;
  }

  const validated = validateSmsApiSendPayload(req.body);
  if (!validated.ok) {
    logSmsSend(req, {
      statusCode: validated.error.statusCode,
      success: false,
      errorCode: validated.error.code,
      errorMessage: validated.error.message,
    });
    publicApiError(
      res,
      validated.error.statusCode,
      requestId,
      validated.error.code,
      validated.error.message,
    );
    return;
  }

  const module = await getSmsApiMessagesModuleState();
  if (!module.available) {
    logSmsSend(req, {
      statusCode: 503,
      success: false,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "SMS API is not available.",
    });
    publicApiError(
      res,
      503,
      requestId,
      "INTERNAL_ERROR",
      "SMS API is not available.",
    );
    return;
  }

  try {
    const resolution = await resolveSandboxSmsSend(
      {
        companyId: auth.companyId,
        apiKeyId: auth.apiKeyId,
        requestId,
        recipient: validated.payload.to,
        message: validated.payload.message,
        sender: validated.payload.sender,
        country: validated.payload.country,
        externalReference: validated.payload.external_reference,
        segments: validated.segments,
        idempotencyKey: idempotency.value,
        environment: auth.environment,
      },
      validated.payload,
    );

    if (resolution.outcome === "conflict") {
      logSmsSend(req, {
        statusCode: 409,
        success: false,
        errorCode: "IDEMPOTENCY_CONFLICT",
        errorMessage:
          "The same Idempotency-Key was already used with a different payload.",
        metadata: {
          idempotency_key_present: true,
        },
      });
      publicApiError(
        res,
        409,
        requestId,
        "IDEMPOTENCY_CONFLICT",
        "The same Idempotency-Key was already used with a different payload.",
      );
      return;
    }

    const message = resolution.message;
    const isReplay = resolution.outcome === "replay";
    const statusCode = isReplay ? 200 : 202;

    logSmsSend(req, {
      statusCode,
      success: true,
      metadata: {
        message_id: message.id,
        segments: message.segments,
        sandbox: true,
        idempotency_key_present: !!idempotency.value,
        idempotent_replay: isReplay,
      },
    });

    console.info("[public-api]", {
      endpoint: SEND_ENDPOINT,
      companyId: auth.companyId,
      apiKeyId: auth.apiKeyId,
      status: statusCode,
      requestId,
      messageId: message.id,
      idempotentReplay: isReplay,
    });

    res.status(statusCode).json({
      success: true,
      request_id: requestId,
      ...(isReplay ? { idempotent_replay: true } : {}),
      message: messageBody(message),
      notice: isReplay
        ? "Idempotent replay: returning the original sandbox message."
        : "Sandbox mode: no SMS was sent and no balance was deducted.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[public-api] POST /api/v1/sms/send", error);
    logSmsSend(req, {
      statusCode: 500,
      success: false,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "An internal error occurred.",
    });
    publicApiError(
      res,
      500,
      requestId,
      "INTERNAL_ERROR",
      "An internal error occurred.",
    );
  }
}
