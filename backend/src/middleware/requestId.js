import crypto from 'crypto';

const HEADER_NAME = 'x-request-id';

/**
 * Attach a unique request ID to each request for tracing and log correlation.
 * Uses X-Request-Id header if present, otherwise generates one.
 */
export function requestIdMiddleware(req, res, next) {
  const incoming = req.headers[HEADER_NAME];
  req.id = typeof incoming === 'string' && incoming.length > 0
    ? incoming
    : crypto.randomUUID();
  res.setHeader(HEADER_NAME, req.id);
  next();
}
