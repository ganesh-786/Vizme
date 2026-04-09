import crypto from 'crypto';

const HEADER_NAME = 'x-request-id';
const MAX_LENGTH = 128;
const VALID_PATTERN = /^[\w.:\-]+$/;

/**
 * Attach a unique request ID to each request for tracing and log correlation.
 * Accepts X-Request-Id from upstream if it passes length/format validation;
 * otherwise generates a fresh UUID to prevent log injection.
 */
export function requestIdMiddleware(req, res, next) {
  const incoming = req.headers[HEADER_NAME];
  const trusted =
    typeof incoming === 'string' &&
    incoming.length > 0 &&
    incoming.length <= MAX_LENGTH &&
    VALID_PATTERN.test(incoming);
  req.id = trusted ? incoming : crypto.randomUUID();
  res.setHeader(HEADER_NAME, req.id);
  next();
}
