import type { NextFunction, Request, Response } from "express";
import {
  authenticateClientApiKey,
  touchClientApiKeyLastUsed,
} from "../services/clientApiKeyService.js";
import type {
  ApiKeyAuthErrorCode,
  AuthenticatedApiKeyContext,
  ClientApiKeyScope,
} from "../types/client-api-keys.js";

declare global {
  namespace Express {
    interface Request {
      apiKeyAuth?: AuthenticatedApiKeyContext;
    }
  }
}

type PublicApiLogEntry = {
  endpoint: string;
  companyId?: string;
  apiKeyId?: string;
  status: number;
  errorCode?: ApiKeyAuthErrorCode;
};

function logPublicApiAccess(entry: PublicApiLogEntry): void {
  console.info("[public-api]", {
    endpoint: entry.endpoint,
    companyId: entry.companyId ?? null,
    apiKeyId: entry.apiKeyId ?? null,
    status: entry.status,
    errorCode: entry.errorCode ?? null,
  });
}

// TODO(Fase 3/4): rate limits por apiKeyId / companyId (Redis o tabla dedicada).
export function requireApiKeyScope(requiredScope: ClientApiKeyScope) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const endpoint = req.originalUrl ?? req.path;

    try {
      const auth = await authenticateClientApiKey(
        req.headers.authorization,
        requiredScope,
      );

      if (!auth.ok) {
        logPublicApiAccess({
          endpoint,
          status: auth.statusCode,
          errorCode: auth.code,
        });
        res.status(auth.statusCode).json({
          success: false,
          error: {
            code: auth.code,
            message: auth.message,
          },
        });
        return;
      }

      req.apiKeyAuth = auth.context;

      void touchClientApiKeyLastUsed(auth.context.apiKeyId).catch(() => {
        /* no bloquear respuesta */
      });

      logPublicApiAccess({
        endpoint,
        companyId: auth.context.companyId,
        apiKeyId: auth.context.apiKeyId,
        status: 200,
      });

      next();
    } catch (error) {
      console.warn("[public-api] auth middleware error", error);
      logPublicApiAccess({
        endpoint,
        status: 500,
        errorCode: "INTERNAL_ERROR",
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred.",
        },
      });
    }
  };
}
