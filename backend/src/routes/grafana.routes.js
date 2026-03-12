import express from 'express';
import jwt from 'jsonwebtoken';
import httpProxy from 'http-proxy';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { UnauthorizedError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { grafanaEmbedLimiter } from '../middleware/rateLimiter.js';
import { ensureGrafanaTenant } from '../services/grafanaTenant.service.js';

const router = express.Router();
const GRAFANA_EMBED_COOKIE = 'vizme_grafana_embed';

/**
 * Parse expiry string (e.g. '15m', '1h') to milliseconds for cookie maxAge.
 */
function parseExpiryToMs(str) {
  const match = String(str || '15m').match(/^(\d+)(m|h|d)$/);
  if (!match) return 15 * 60 * 1000;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'm') return num * 60 * 1000;
  if (unit === 'h') return num * 60 * 60 * 1000;
  if (unit === 'd') return num * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000;
}

/**
 * GET /api/v1/grafana/embed-url
 * Returns a signed embed URL for Grafana dashboard with user_id enforced.
 * Requires JWT auth. Rate limited to prevent abuse.
 */
router.get('/embed-url', grafanaEmbedLimiter, authenticate, (req, res, next) => {
  try {
    const {
      dashboard = 'metrics',
      from = 'now-1h',
      to = 'now',
      refresh = '10s',
      kiosk = 'tv',
    } = req.query;
    const userId = req.user.id;
    const embedTokenExpiry = config.grafanaEmbedTokenExpiry || '15m';

    const embedToken = jwt.sign(
      { userId, purpose: 'grafana-embed', dashboard },
      config.jwt.secret,
      { expiresIn: embedTokenExpiry }
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

    res.json({ success: true, data: { url, expiresIn: embedTokenExpiry } });
  } catch (error) {
    next(error);
  }
});

/**
 * Validate embed token (from query or cookie) and return userId.
 * For raw HTTP upgrade requests, pass parsed cookies and query.
 */
function validateEmbedToken(reqOrToken, options = {}) {
  const token =
    options.token ??
    (reqOrToken?.query?.embed_token || reqOrToken?.cookies?.[GRAFANA_EMBED_COOKIE]);
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
 * Parse cookies from raw Cookie header string.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((part) => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  });
  return cookies;
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
 * Ensures org per user with Mimir datasource (X-Scope-OrgID) for hard isolation.
 */
export async function grafanaProxyMiddleware(req, res, next) {
  const userId = validateEmbedToken(req);
  if (!userId) {
    return next(new UnauthorizedError('Valid embed token required to view Grafana'));
  }

  const orgId = await ensureGrafanaTenant(userId);
  if (!orgId) {
    // Send 503 directly with frame-allowing headers so iframe can display the message
    // (Helmet sets X-Frame-Options: sameorigin, which blocks cross-origin iframes)
    res.removeHeader('X-Frame-Options');
    const frontendOrigin = config.cors.frontendUrl || '';
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frontendOrigin}`);
    return res.status(503).json({
      success: false,
      error: 'Dashboard unavailable',
      message:
        'Tenant setup failed. Check backend logs for details. Ensure: (1) Grafana is running, (2) GRAFANA_ADMIN_USER/PASSWORD match Grafana, (3) MIMIR_URL is reachable from Grafana. Docker: MIMIR_URL=http://mimir:8080, GRAFANA_INTERNAL_URL=http://grafana:3000. Local dev: GRAFANA_URL=http://localhost:3001. Verify: GET /health/grafana',
    });
  }

  const grafanaBase = getGrafanaBaseUrl();
  // Use full path: when mounted at /grafana, req.path is relative; req.baseUrl + req.path = /grafana/api/...
  let path = (req.baseUrl || '') + (req.path || req.url?.split('?')[0] || '/');
  if (path.startsWith('/grafana')) path = path.slice(9) || '/';
  path = '/' + path.replace(/^\/+/, '');

  // Fix path duplication: Grafana 11 sometimes builds .../grafana/api/... mid-path (datasource proxy bug)
  path = path.replace(/\/grafana\/api(?=\/)/g, '/api');

  if (path.includes('/namespaces/org-')) {
    path = path.replace(/\/namespaces\/org-[^/]+/, `/namespaces/org-${orgId}`);
  }

  const query = new URLSearchParams(req.query);
  query.delete('embed_token');
  query.set('var-user_id', String(userId));
  query.set('orgId', String(orgId));
  const queryStr = query.toString();

  const targetUrl = `${grafanaBase}/grafana${path}${queryStr ? `?${queryStr}` : ''}`;

  const cookieMaxAge = parseExpiryToMs(config.grafanaEmbedTokenExpiry);
  if (req.query.embed_token && !req.cookies?.[GRAFANA_EMBED_COOKIE]) {
    res.cookie(GRAFANA_EMBED_COOKIE, req.query.embed_token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: config.isProduction ? 'strict' : 'lax',
      maxAge: cookieMaxAge,
      path: '/grafana',
    });
  }

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers.authorization;
    headers['Host'] = new URL(grafanaBase).host;
    headers['X-WEBAUTH-USER'] = `vizme_user_${userId}`;
    headers['X-WEBAUTH-ORGS'] = `${orgId}:Admin`;
    headers['X-Grafana-Org-Id'] = String(orgId);
    headers['X-Scope-OrgID'] = String(userId);

    const fetchOpts = {
      method: req.method,
      headers,
      redirect: 'manual',
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
      fetchOpts.body =
        typeof req.body === 'string' || Buffer.isBuffer(req.body)
          ? req.body
          : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOpts);

    if (response.status >= 400) {
      logger.warn(
        { status: response.status, path, targetUrl: targetUrl.replace(/:[^:@]+@/, ':***@'), method: req.method },
        'Grafana proxy non-2xx response'
      );
    }

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
    const message =
      error.cause?.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')
        ? 'Grafana is unavailable. Ensure Grafana is running (e.g. docker compose up grafana).'
        : error.message;
    const err = new Error(message);
    err.status = 503;
    next(err);
  }
}

/**
 * Attach WebSocket upgrade handler for Grafana Live (/grafana/api/live/ws).
 * Must be called with the HTTP server after app.listen.
 */
export function setupGrafanaWebSocketProxy(server) {
  const proxy = httpProxy.createProxyServer({});
  const grafanaBase = getGrafanaBaseUrl();

  proxy.on('error', (err, req, socket) => {
    socket.destroy();
  });

  server.on('upgrade', async (req, socket, head) => {
    if (!req.url?.startsWith('/grafana')) return;

    const [pathPart, queryPart] = req.url.split('?');
    const query = new URLSearchParams(queryPart || '');
    const cookies = parseCookies(req.headers.cookie);
    const token = query.get('embed_token') || cookies[GRAFANA_EMBED_COOKIE];
    const userId = validateEmbedToken(null, { token });

    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const orgId = await ensureGrafanaTenant(userId);
    if (!orgId) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }
    query.delete('embed_token');
    query.set('var-user_id', String(userId));
    query.set('orgId', String(orgId));
    const newQuery = query.toString();
    let wsPath = pathPart;
    if (wsPath.includes('/namespaces/org-')) {
      wsPath = wsPath.replace(/\/namespaces\/org-[^/]+/, `/namespaces/org-${orgId}`);
    }
    req.url = `${wsPath}${newQuery ? `?${newQuery}` : ''}`;
    req.headers['x-webauth-user'] = `vizme_user_${userId}`;
    req.headers['x-webauth-orgs'] = `${orgId}:Admin`;
    req.headers['x-grafana-org-id'] = String(orgId);
    req.headers['x-scope-orgid'] = String(userId); // Mimir tenant for WebSocket/Live

    proxy.ws(req, socket, head, {
      target: grafanaBase,
      ws: true,
    });
  });
}

export { router as grafanaRoutes };
