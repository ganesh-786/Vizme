/**
 * Global Error Handler Middleware
 * Handles all errors and returns consistent error responses
 */

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Default error
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Validation errors (from express-validator)
  if (err.type === 'validation') {
    statusCode = 400;
    message = err.message;
  }

  // Axios errors (from Prometheus service)
  if (err.isAxiosError) {
    statusCode = 502;
    message = 'Failed to communicate with Prometheus service';
  }

  // Sequelize database errors
  if (err.name === 'SequelizeDatabaseError' || err.name === 'SequelizeConnectionError') {
    statusCode = 503;
    message = 'Database connection error. Please try again later.';
    logger.error('Database error:', {
      error: err.message,
      name: err.name,
      original: err.original?.message
    });
  }

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    message = err.errors?.[0]?.message || err.message || 'Validation error';
  }

  // Don't expose internal error details in production
  const response = {
    error: true,
    message,
    timestamp: new Date().toISOString(),
    path: req.path
  };

  // Include stack trace and details in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = {
      name: err.name,
      message: err.message
    };
    if (err.errors) {
      response.details.errors = err.errors;
    }
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;

