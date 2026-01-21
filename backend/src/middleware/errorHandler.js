export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Validation errors
  if (err.name === 'ValidationError' || err.name === 'BadRequestError') {
    return res.status(400).json({
      success: false,
      error: err.message || 'Validation error',
      details: err.errors || []
    });
  }

  // Authentication errors
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: err.message || 'Invalid or expired token'
    });
  }

  // Database errors
  if (err.code === '23505') { // Unique violation
    return res.status(409).json({
      success: false,
      error: 'Conflict',
      message: 'Resource already exists'
    });
  }

  if (err.code === '23503') { // Foreign key violation
    return res.status(400).json({
      success: false,
      error: 'Invalid reference',
      message: 'Referenced resource does not exist'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
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
