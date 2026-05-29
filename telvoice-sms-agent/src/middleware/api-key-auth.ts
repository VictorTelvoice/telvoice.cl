import type { NextFunction, Request, Response } from "express";
import {
  applyRateLimitHeaders,
  buildRateLimitExceededBody,
  checkApiRateLimit,
} from "../services/apiRateLimitService.js";
import {
  authenticateClientApiKey,
  touchClientApiKeyLastUsed,
} from "../services/clientApiKeyService.js";
import type {
  AuthenticatedApiKeyContext,
  ClientApiKeyScope,
} from "../types/client-api-keys.js";
import type { ClientApiRequestMethod } from "../types/client-api-requests.js";
import { publicApiError } from "../utils/public-api-response.js";
import {
  getPublicApiRequestId,
} from "./public-api-request-context.js";
import { recordPublicApiRequest } from "./public-api-request-log.js";

declare global {
  namespace Express {
    interface Request {
      apiKeyAuth?: AuthenticatedApiKeyContext;
      apiRateLimitHeaders?: import("../types/api-rate-limit.js").ApiRateLimitHeaders;
    }
  }
}

function parseRequestMethod(req: Request): ClientApiRequestMethod {
  const method = req.method.toUpperCase();
  if (
    method === "GET" ||
    method === "POST" ||
    method === "PUT" ||
    method === "PATCH" ||
    method === "DELETE"
  ) {
    return method;
  }
  return "GET";
}

// Rate limits: client_api_requests (ver apiRateLimitService.ts). TODO: Redis + override admin alto volumen.
export function requireApiKeyScope(requiredScope: ClientApiKeyScope) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const endpoint = (req.originalUrl ?? req.path).split("?")[0] || "/api/v1";
    const requestId = getPublicApiRequestId(req);
    const method = parseRequestMethod(req);

    try {
      const auth = await authenticateClientApiKey(
        req.headers.authorization,
        requiredScope,
      );

      if (!auth.ok) {
        recordPublicApiRequest({
          req,
          endpoint,
          method,
          statusCode: auth.statusCode,
          success: false,
          companyId: auth.resolved?.companyId ?? null,
          apiKeyId: auth.resolved?.apiKeyId ?? null,
          environment: auth.resolved?.environment ?? null,
          errorCode: auth.code,
          errorMessage: auth.message,
        });

        console.info("[public-api]", {
          endpoint,
          companyId: auth.resolved?.companyId ?? null,
          apiKeyId: auth.resolved?.apiKeyId ?? null,
          status: auth.statusCode,
          errorCode: auth.code,
          requestId,
        });

        publicApiError(res, auth.statusCode, requestId, auth.code, auth.message);
        return;
      }

      req.apiKeyAuth = auth.context;

      const rateLimit = await checkApiRateLimit({
        companyId: auth.context.companyId,
        apiKeyId: auth.context.apiKeyId,
        environment: auth.context.environment,
        endpoint,
        method,
        requestId,
      });

      if (!rateLimit.allowed) {
        applyRateLimitHeaders(res, rateLimit.headers);
        recordPublicApiRequest({
          req,
          endpoint,
          method,
          statusCode: 429,
          success: false,
          companyId: auth.context.companyId,
          apiKeyId: auth.context.apiKeyId,
          environment: auth.context.environment,
          errorCode: "RATE_LIMIT_EXCEEDED",
          errorMessage: "Rate limit exceeded. Please retry later.",
          metadata: {
            rate_limit_scope: rateLimit.scope,
            limit: rateLimit.limit,
            retry_after_seconds: rateLimit.retryAfterSeconds,
            endpoint,
          },
        });

        console.info("[public-api]", {
          endpoint,
          companyId: auth.context.companyId,
          apiKeyId: auth.context.apiKeyId,
          status: 429,
          errorCode: "RATE_LIMIT_EXCEEDED",
          scope: rateLimit.scope,
          requestId,
        });

        res.status(429).json(
          buildRateLimitExceededBody(
            requestId,
            rateLimit.scope,
            rateLimit.limit,
            rateLimit.retryAfterSeconds,
          ),
        );
        return;
      }

      req.apiRateLimitHeaders = rateLimit.headers;
      applyRateLimitHeaders(res, rateLimit.headers);

      void touchClientApiKeyLastUsed(auth.context.apiKeyId).catch(() => {
        /* no bloquear respuesta */
      });

      next();
    } catch (error) {
      console.warn("[public-api] auth middleware error", error);
      recordPublicApiRequest({
        req,
        endpoint,
        method,
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
  };
}
