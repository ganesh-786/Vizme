import { logger } from '../logger.js';
import { config } from '../config.js';

export const errorHandler = (err, req, res, next) => {
  const requestId = req.id || '-';
  const logPayload = {
    err: { message: err.message, name: err.name, code: err.code },
    requestId,
    path: req.path,
    method: req.method,
  };
  if (config.isProduction) {
    logger.error(logPayload, err.message);
  } else {
    logger.error({ ...logPayload, stack: err.stack }, err.message);
  }

  // Validation errors
  if (err.name === 'ValidationError' || err.name === 'BadRequestError') {
    return res.status(400).json({
      success: false,
      error: err.message || 'Validation error',
      details: err.errors || [],
      ...(requestId !== '-' && { requestId }),
    });
  }

  // Authentication errors
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: err.message || 'Invalid or expired token',
      ...(requestId !== '-' && { requestId }),
    });
  }

  // Database errors
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'Conflict',
      message: 'Resource already exists',
      ...(requestId !== '-' && { requestId }),
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      error: 'Invalid reference',
      message: 'Referenced resource does not exist',
      ...(requestId !== '-' && { requestId }),
    });
  }

  const status = err.status || 500;
  const body = {
    success: false,
    error: config.isProduction ? 'Internal server error' : err.message,
    ...(requestId !== '-' && { requestId }),
  };
  if (!config.isProduction && err.stack) body.stack = err.stack;
  res.status(status).json(body);
};

export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', errors = []) {
    super(message, 400);
    this.errors = errors;
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}
