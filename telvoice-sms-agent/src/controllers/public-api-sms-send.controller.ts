import type { Request, Response } from "express";
import { getPublicApiRequestId } from "../middleware/public-api-request-context.js";
import { recordPublicApiRequest } from "../middleware/public-api-request-log.js";
import { validateProductionApiSmsSendAccess } from "../services/clientApiProductionStatusService.js";
import {
  getSmsApiMessagesModuleState,
  resolveProductionSmsSend,
  resolveSandboxSmsSend,
  validateIdempotencyKeyHeader,
  validateSmsApiSendPayload,
} from "../services/smsApiMessageService.js";
import type { SmsApiMessage } from "../types/sms-api-messages.js";
import { AppError } from "../utils/errors.js";
import { publicApiError } from "../utils/public-api-response.js";

const SEND_ENDPOINT = "/api/v1/sms/send";

function mapValidationCode(code: string): string {
  if (code === "INVALID_RECIPIENT") {
    return "INVALID_DESTINATION";
  }
  return code;
}

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

function mapAppError(error: AppError): { statusCode: number; code: string; message: string } {
  const msg = error.message;
  if (msg.includes("saldo") || msg.includes("Saldo")) {
    return { statusCode: 402, code: "INSUFFICIENT_BALANCE", message: msg };
  }
  if (msg.includes("Wallet") || msg.includes("wallet")) {
    return { statusCode: 403, code: "WALLET_INACTIVE", message: msg };
  }
  if (msg.includes("API no está habilitado") || msg.includes("rate plan")) {
    return { statusCode: 403, code: "API_NOT_ENABLED", message: msg };
  }
  return {
    statusCode: error.statusCode,
    code: error.statusCode === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
    message: msg,
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
    const code = mapValidationCode(validated.error.code);
    logSmsSend(req, {
      statusCode: validated.error.statusCode,
      success: false,
      errorCode: code,
      errorMessage: validated.error.message,
    });
    publicApiError(
      res,
      validated.error.statusCode,
      requestId,
      code,
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

  const isProduction = auth.environment === "production";

  if (isProduction) {
    const access = await validateProductionApiSmsSendAccess(auth, validated.segments);
    if (!access.ok) {
      logSmsSend(req, {
        statusCode: access.error.statusCode,
        success: false,
        errorCode: access.error.code,
        errorMessage: access.error.message,
        metadata: {
          production_approved: auth.productionApproved,
          blocking_reason: access.error.blockingReason ?? null,
        },
      });
      publicApiError(
        res,
        access.error.statusCode,
        requestId,
        access.error.code,
        access.error.message,
      );
      return;
    }
  }

  try {
    const resolution = isProduction
      ? await resolveProductionSmsSend(
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
        )
      : await resolveSandboxSmsSend(
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
        sandbox: !isProduction,
        production: isProduction,
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
      environment: auth.environment,
    });

    res.status(statusCode).json({
      success: true,
      request_id: requestId,
      ...(isReplay ? { idempotent_replay: true } : {}),
      message: messageBody(message),
      notice: isReplay
        ? "Idempotent replay: returning the original message."
        : isProduction
          ? "Production SMS accepted for delivery."
          : "Sandbox mode: no SMS was sent and no balance was deducted.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapAppError(error);
      logSmsSend(req, {
        statusCode: mapped.statusCode,
        success: false,
        errorCode: mapped.code,
        errorMessage: mapped.message,
      });
      publicApiError(res, mapped.statusCode, requestId, mapped.code, mapped.message);
      return;
    }

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
