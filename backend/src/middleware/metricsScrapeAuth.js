/**
 * Optional basic auth for /metrics endpoint (Prometheus scrape).
 * Enable by setting METRICS_SCRAPE_USER and METRICS_SCRAPE_PASSWORD.
 * When enabled, Prometheus must use basic_auth in scrape_config.
 */
import crypto from 'crypto';
import { config } from '../config.js';

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function metricsScrapeAuthMiddleware(req, res, next) {
  const { username, password } = config.metricsScrapeAuth;
  if (!username || !password) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Prometheus metrics"');
    res.status(401).end('Unauthorized');
    return;
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    const separatorIdx = decoded.indexOf(':');
    if (separatorIdx < 0) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Prometheus metrics"');
      res.status(401).end('Unauthorized');
      return;
    }
    const user = decoded.slice(0, separatorIdx);
    const pass = decoded.slice(separatorIdx + 1);
    if (constantTimeEqual(user, username) && constantTimeEqual(pass, password)) {
      return next();
    }
  } catch {
    // Invalid base64
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Prometheus metrics"');
  res.status(401).end('Unauthorized');
}
