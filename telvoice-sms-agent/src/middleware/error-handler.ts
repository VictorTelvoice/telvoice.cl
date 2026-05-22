import type { NextFunction, Request, Response } from "express";
import { isAxiosError } from "axios";
import { AppError } from "../utils/errors.js";

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ErrorBody = {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Ruta no encontrada.",
    },
  };
  res.status(404).json(body);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ErrorBody = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (isAxiosError(err)) {
    const body: ErrorBody = {
      success: false,
      error: {
        code: "HTTP_CLIENT_ERROR",
        message: err.message,
        details: err.response?.data,
      },
    };
    res.status(err.response?.status ?? 502).json(body);
    return;
  }

  console.error("[error]", err);

  const body: ErrorBody = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Error interno del servidor.",
    },
  };
  res.status(500).json(body);
}
