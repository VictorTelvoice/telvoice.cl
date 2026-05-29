import type { Request, Response } from "express";
import { getPublicApiRequestId } from "../middleware/public-api-request-context.js";
import { recordPublicApiRequest } from "../middleware/public-api-request-log.js";
import {
  getSmsApiMessageById,
  getSmsApiMessagesModuleState,
  isValidSmsApiMessageId,
  listSmsApiMessages,
  parseSmsApiMessageListQuery,
} from "../services/smsApiMessageService.js";
import type { SmsApiMessage } from "../types/sms-api-messages.js";
import { publicApiError } from "../utils/public-api-response.js";

const LIST_ENDPOINT = "/api/v1/messages";

function detailEndpoint(messageId: string): string {
  return `/api/v1/messages/${messageId}`;
}

function logMessagesRequest(
  req: Request,
  params: {
    endpoint: string;
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
    endpoint: params.endpoint,
    method: "GET",
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

function toPublicMessageDetail(message: SmsApiMessage) {
  return {
    id: message.id,
    external_reference: message.externalReference,
    to: message.recipient,
    sender: message.sender,
    country: message.country,
    message: message.message,
    segments: message.segments,
    status: message.status,
    environment: message.environment,
    cost_sms: message.costSms,
    dlr_status: message.dlrStatus,
    provider_message_id: message.providerMessageId,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
  };
}

function toPublicMessageListItem(message: SmsApiMessage) {
  return {
    id: message.id,
    external_reference: message.externalReference,
    to: message.recipient,
    sender: message.sender,
    segments: message.segments,
    status: message.status,
    environment: message.environment,
    cost_sms: message.costSms,
    created_at: message.createdAt,
  };
}

export async function getPublicApiMessageById(
  req: Request,
  res: Response,
): Promise<void> {
  const requestId = getPublicApiRequestId(req);
  const auth = req.apiKeyAuth;
  const rawId = req.params.id;
  const messageId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] ?? "" : "";

  if (!auth) {
    logMessagesRequest(req, {
      endpoint: detailEndpoint(messageId),
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

  if (!isValidSmsApiMessageId(messageId)) {
    logMessagesRequest(req, {
      endpoint: detailEndpoint(messageId),
      statusCode: 400,
      success: false,
      errorCode: "INVALID_MESSAGE_ID",
      errorMessage: "Message id must be a valid UUID.",
      metadata: { filter_type: "detail" },
    });
    publicApiError(
      res,
      400,
      requestId,
      "INVALID_MESSAGE_ID",
      "Message id must be a valid UUID.",
    );
    return;
  }

  const module = await getSmsApiMessagesModuleState();
  if (!module.available) {
    logMessagesRequest(req, {
      endpoint: detailEndpoint(messageId),
      statusCode: 503,
      success: false,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "SMS API is not available.",
      metadata: { filter_type: "detail", message_id: messageId },
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
    const message = await getSmsApiMessageById(auth.companyId, messageId);
    if (!message) {
      logMessagesRequest(req, {
        endpoint: detailEndpoint(messageId),
        statusCode: 404,
        success: false,
        errorCode: "MESSAGE_NOT_FOUND",
        errorMessage: "Message not found.",
        metadata: { filter_type: "detail", message_id: messageId },
      });
      publicApiError(
        res,
        404,
        requestId,
        "MESSAGE_NOT_FOUND",
        "Message not found.",
      );
      return;
    }

    logMessagesRequest(req, {
      endpoint: detailEndpoint(messageId),
      statusCode: 200,
      success: true,
      metadata: {
        filter_type: "detail",
        message_id: message.id,
      },
    });

    console.info("[public-api]", {
      endpoint: detailEndpoint(messageId),
      companyId: auth.companyId,
      apiKeyId: auth.apiKeyId,
      status: 200,
      requestId,
      messageId: message.id,
    });

    res.json({
      success: true,
      request_id: requestId,
      message: toPublicMessageDetail(message),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[public-api] GET /api/v1/messages/:id", error);
    logMessagesRequest(req, {
      endpoint: detailEndpoint(messageId),
      statusCode: 500,
      success: false,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "An internal error occurred.",
      metadata: { filter_type: "detail", message_id: messageId },
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

export async function listPublicApiMessages(
  req: Request,
  res: Response,
): Promise<void> {
  const requestId = getPublicApiRequestId(req);
  const auth = req.apiKeyAuth;

  if (!auth) {
    logMessagesRequest(req, {
      endpoint: LIST_ENDPOINT,
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

  const parsed = parseSmsApiMessageListQuery(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    logMessagesRequest(req, {
      endpoint: LIST_ENDPOINT,
      statusCode: parsed.error.statusCode,
      success: false,
      errorCode: parsed.error.code,
      errorMessage: parsed.error.message,
      metadata: { filter_type: "list" },
    });
    publicApiError(
      res,
      parsed.error.statusCode,
      requestId,
      parsed.error.code,
      parsed.error.message,
    );
    return;
  }

  const module = await getSmsApiMessagesModuleState();
  if (!module.available) {
    logMessagesRequest(req, {
      endpoint: LIST_ENDPOINT,
      statusCode: 503,
      success: false,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "SMS API is not available.",
      metadata: {
        filter_type: "list",
        limit: parsed.filters.limit,
      },
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
    const result = await listSmsApiMessages(auth.companyId, parsed.filters);

    const listMetadata: Record<string, unknown> = {
      filter_type: "list",
      limit: parsed.filters.limit,
    };
    if (parsed.filters.status) {
      listMetadata.status = parsed.filters.status;
    }
    if (parsed.filters.environment) {
      listMetadata.environment = parsed.filters.environment;
    }
    if (parsed.filters.externalReference) {
      listMetadata.external_reference = parsed.filters.externalReference;
    }

    logMessagesRequest(req, {
      endpoint: LIST_ENDPOINT,
      statusCode: 200,
      success: true,
      metadata: listMetadata,
    });

    console.info("[public-api]", {
      endpoint: LIST_ENDPOINT,
      companyId: auth.companyId,
      apiKeyId: auth.apiKeyId,
      status: 200,
      requestId,
      count: result.messages.length,
    });

    res.json({
      success: true,
      request_id: requestId,
      messages: result.messages.map(toPublicMessageListItem),
      pagination: {
        limit: parsed.filters.limit,
        next_cursor: result.nextCursor,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[public-api] GET /api/v1/messages", error);
    logMessagesRequest(req, {
      endpoint: LIST_ENDPOINT,
      statusCode: 500,
      success: false,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "An internal error occurred.",
      metadata: { filter_type: "list", limit: parsed.filters.limit },
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
