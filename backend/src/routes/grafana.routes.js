import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UnauthorizedError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();
const GRAFANA_EMBED_COOKIE = 'vizme_grafana_embed';
const EMBED_TOKEN_EXPIRY = '5m';

/**
 * GET /api/v1/grafana/embed-url
 * Returns a signed embed URL for Grafana dashboard with user_id enforced.
 * Requires JWT auth.
 */
router.get('/embed-url', authenticate, (req, res, next) => {
  try {
    const { dashboard = 'metrics', from = 'now-1h', to = 'now', refresh = '10s', kiosk = 'tv' } = req.query;
    const userId = req.user.id;

    const embedToken = jwt.sign(
      { userId, purpose: 'grafana-embed', dashboard },
      config.jwt.secret,
      { expiresIn: EMBED_TOKEN_EXPIRY }
    );

    const baseUrl = config.api.baseUrl || `${req.protocol}://${req.get('host')}`;
    const params = new URLSearchParams({
      embed_token: embedToken,
      'var-user_id': String(userId),
      from,
      to,
      refresh,
      ...(kiosk === 'tv' || kiosk === 'true' ? { kiosk: 'tv' } : {}),
    });

    const url = `${baseUrl}/grafana/d/${dashboard}?${params.toString()}`;

    res.json({ success: true, data: { url } });
  } catch (error) {
    next(error);
  }
});

/**
 * Validate embed token (from query or cookie) and return userId
 */
function validateEmbedToken(req) {
  const token = req.query.embed_token || req.cookies?.[GRAFANA_EMBED_COOKIE];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.purpose !== 'grafana-embed') return null;
    return decoded.userId;
  } catch {
    return null;
  }
}

/**
 * Resolve Grafana base URL. Use GRAFANA_INTERNAL_URL when backend runs in Docker
 * (localhost from inside container refers to the container itself).
 */
function getGrafanaBaseUrl() {
  const internal = process.env.GRAFANA_INTERNAL_URL;
  if (internal) return internal.replace(/\/$/, '');
  return config.urls.grafana?.replace(/\/$/, '') || 'http://localhost:3001';
}

/**
 * Proxies requests to Grafana at /grafana/*.
 * Validates embed_token, forces var-user_id from token.
 * Sets cookie on first request so subsequent Grafana asset/API requests work.
 */
export async function grafanaProxyMiddleware(req, res, next) {
  const userId = validateEmbedToken(req);
  if (!userId) {
    return next(new UnauthorizedError('Valid embed token required to view Grafana'));
  }

  const grafanaBase = getGrafanaBaseUrl();
  const path = req.path || '/';

  const query = new URLSearchParams(req.query);
  query.delete('embed_token');
  query.set('var-user_id', String(userId));
  const queryStr = query.toString();

  const targetUrl = `${grafanaBase}/grafana${path}${queryStr ? `?${queryStr}` : ''}`;

  if (req.query.embed_token && !req.cookies?.[GRAFANA_EMBED_COOKIE]) {
    res.cookie(GRAFANA_EMBED_COOKIE, req.query.embed_token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: config.isProduction ? 'strict' : 'lax',
      maxAge: 5 * 60 * 1000,
      path: '/grafana',
    });
  }

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers.authorization;
    headers['X-WEBAUTH-USER'] = `vizme_user_${userId}`;

    const fetchOpts = {
      method: req.method,
      headers,
      redirect: 'manual',
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOpts);

    res.status(response.status);
    const frontendOrigin = config.cors.frontendUrl || '';
    const allowedFrameAncestors = ["'self'", frontendOrigin].filter(Boolean).join(' ');

    response.headers.forEach((v, k) => {
      const lower = k.toLowerCase();
      if (lower === 'x-frame-options' || lower === 'content-security-policy') return;
      if (lower !== 'transfer-encoding' && lower !== 'content-encoding') {
        res.setHeader(k, v);
      }
    });

    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedFrameAncestors}`);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      const text = await response.text();
      res.send(text);
    } else {
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (error) {
    const message = error.cause?.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')
      ? 'Grafana is unavailable. Ensure Grafana is running (e.g. docker compose up grafana).'
      : error.message;
    const err = new Error(message);
    err.status = 503;
    next(err);
  }
}

export { router as grafanaRoutes };
