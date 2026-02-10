import type { Request, Response, NextFunction } from 'express';
import { env } from '@/config/env.js';

type AppError = {
  statusCode?: number;
  code?: string;
  message?: string;
};

// Express error-handling middleware.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const statusCode =
    typeof (err as AppError)?.statusCode === 'number'
      ? (err as AppError).statusCode!
      : 500;

  const errorCode =
    typeof (err as AppError)?.code === 'string'
      ? (err as AppError).code!
      : statusCode === 500
        ? 'InternalServerError'
        : 'RequestError';

  req.log?.error({ err }, 'Request failed');

  const publicMessage =
    env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : message;

  res.status(statusCode).json({ error: errorCode, message: publicMessage });
}
