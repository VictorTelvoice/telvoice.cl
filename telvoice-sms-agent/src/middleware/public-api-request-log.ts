import type { Request } from "express";
import { createApiRequestLog } from "../services/clientApiRequestLogService.js";
import type { ClientApiRequestMethod } from "../types/client-api-requests.js";
import type { ClientApiKeyEnvironment } from "../types/client-api-keys.js";
import {
  extractClientIp,
  truncateUserAgent,
} from "../utils/public-api-request-id.js";
import {
  getPublicApiDurationMs,
  getPublicApiRequestId,
} from "./public-api-request-context.js";

export type PublicApiRequestLogParams = {
  req: Request;
  endpoint: string;
  method: ClientApiRequestMethod;
  statusCode: number;
  success: boolean;
  companyId?: string | null;
  apiKeyId?: string | null;
  environment?: ClientApiKeyEnvironment | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export function recordPublicApiRequest(params: PublicApiRequestLogParams): void {
  const {
    req,
    endpoint,
    method,
    statusCode,
    success,
    companyId,
    apiKeyId,
    environment,
    errorCode,
    errorMessage,
  } = params;

  void createApiRequestLog({
    companyId: companyId ?? null,
    apiKeyId: apiKeyId ?? null,
    requestId: getPublicApiRequestId(req),
    endpoint,
    method,
    environment: environment ?? null,
    statusCode,
    success,
    errorCode: errorCode ?? null,
    errorMessage: errorMessage ?? null,
    ipAddress: extractClientIp(req),
    userAgent: truncateUserAgent(
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : undefined,
    ),
    durationMs: getPublicApiDurationMs(req),
    metadata: params.metadata ?? {},
  }).catch(() => {
    /* no bloquear respuesta */
  });
}
