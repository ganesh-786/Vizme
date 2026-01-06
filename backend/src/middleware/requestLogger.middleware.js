/**
 * Request Logger Middleware
 * Logs incoming requests with additional context
 */

const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    contentType: req.get('content-type')
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });

  next();
};

module.exports = requestLogger;

