import express from 'express';
import jwt from 'jsonwebtoken';
import httpProxy from 'http-proxy';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { UnauthorizedError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { grafanaEmbedLimiter } from '../middleware/rateLimiter.js';
import {
  ensureGrafanaTenant,
  inspectDatasourceHealthInOrg,
  reprovisionTenantDashboard,
  verifyMetricsDashboardInOrg,
  verifyMimirDatasourceInOrg,
} from '../services/grafanaTenant.service.js';
import { resolveGrafanaConnection } from '../services/grafanaConnection.service.js';
import {
  clearGrafanaEmbedCookie,
  GRAFANA_EMBED_COOKIE,
  setGrafanaEmbedCookie,
} from '../services/grafanaEmbedSession.service.js';

const router = express.Router();
/** Canonical slug from metrics dashboard meta (title "Vizme Metrics" → vizme-metrics). */
const METRICS_DASHBOARD_SLUG = 'vizme-metrics';

/**
 * Stable Grafana auth-proxy login from Vizme user (prefer email; fallback vizme_user_{id}).
 */
function grafanaLoginFromUser(user) {
  const raw = (user?.email || '').trim().toLowerCase();
  if (raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return raw.replace(/[^a-z0-9@._+-]/gi, '_').slice(0, 190);
  }
  return `vizme_user_${user.id}`;
}

/**
 * Where the browser should load /grafana (must hit the Vizme backend proxy).
 */
function resolveGrafanaEmbedPublicBase(req) {
  const explicit = (config.grafana?.embedPublicBaseUrl || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const fe = (config.cors.frontendUrl || '').replace(/\/$/, '');
  const api = (config.api.baseUrl || '').replace(/\/$/, '');

  try {
    if (fe && api) {
      const feOrigin = new URL(fe).origin;
      const apiOrigin = new URL(api).origin;
      if (feOrigin !== apiOrigin) {
        return api;
      }
    }
  } catch (_) {}

  return fe || api || `${req.protocol}://${req.get('host')}`;
}

function normalizeGrafanaSiteFilter(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '.*';
  return /^\d+$/.test(raw) ? raw : '.*';
}

function wantsBrowserRedirect(req) {
  const explicit = String(req.query.redirect || '').toLowerCase();
  if (explicit === '1' || explicit === 'true') return true;

  const mode = req.get('sec-fetch-mode');
  const dest = req.get('sec-fetch-dest');
  return mode === 'navigate' || dest === 'document';
}

/**
 * GET /api/v1/grafana/embed-url
 * Returns a signed embed URL for Grafana dashboard with user_id enforced.
 * Requires JWT auth. Rate limited to prevent abuse.
 */
router.get('/embed-url', grafanaEmbedLimiter, authenticate, async (req, res, next) => {
  try {
    const {
      dashboard = 'metrics',
      from = 'now-24h',
      to = 'now',
      refresh = '10s',
      kiosk,
    } = req.query;
    const userId = req.user.id;
    const grafanaLogin = grafanaLoginFromUser(req.user);

    const grafanaConn = await resolveGrafanaConnection();
    if (!grafanaConn.apiBase) {
      return res.status(503).json({
        success: false,
        error: 'Grafana unavailable',
        code: grafanaConn.authFailed ? 'grafana_admin_auth' : 'grafana_unreachable',
        message: grafanaConn.authFailed
          ? 'Grafana admin API rejected credentials. Set GRAFANA_ADMIN_USER and GRAFANA_ADMIN_PASSWORD to match the Grafana container (docker-compose: GF_SECURITY_ADMIN_USER / GF_SECURITY_ADMIN_PASSWORD).'
          : 'Could not reach Grafana at any configured URL. If the API runs on your host and Grafana is in Docker, set GRAFANA_URL=http://localhost:3001 (or 127.0.0.1:3001) and/or unset GRAFANA_INTERNAL_URL so the backend does not use the Docker-only hostname "grafana". Verify: GET /health/grafana',
      });
    }

    let orgId = await ensureGrafanaTenant(userId, { grafanaLogin });
    if (!orgId) {
      return res.status(503).json({
        success: false,
        error: 'Grafana unavailable',
        code: 'grafana_tenant_setup',
        message:
          'Could not prepare your Grafana tenant (org, datasources, or dashboard). Ensure Mimir is reachable from Grafana, dashboard JSON is mounted, and admin credentials are valid. Check GET /health/grafana-ready on the API.',
      });
    }

    let dashboardOk = await verifyMetricsDashboardInOrg(orgId);
    if (!dashboardOk) {
      await reprovisionTenantDashboard(userId);
      dashboardOk = await verifyMetricsDashboardInOrg(orgId);
    }
    if (!dashboardOk) {
      return res.status(503).json({
        success: false,
        error: 'Grafana dashboard missing',
        message:
          'Dashboard uid=metrics is not present in your Grafana org. Ensure docker/grafana/dashboards/metrics-dashboard.json is mounted and Grafana provisioning completed.',
      });
    }

    let mimirDatasourceOk = await verifyMimirDatasourceInOrg(orgId, userId);
    if (!mimirDatasourceOk) {
      orgId = await ensureGrafanaTenant(userId, { grafanaLogin });
      mimirDatasourceOk = orgId ? await verifyMimirDatasourceInOrg(orgId, userId) : false;
    }
    if (!mimirDatasourceOk) {
      const datasourceHealth = orgId
        ? await inspectDatasourceHealthInOrg(orgId, `mimir-${userId}`)
        : null;
      return res.status(503).json({
        success: false,
        error: 'Grafana datasource unhealthy',
        code: 'grafana_mimir_datasource_unhealthy',
        message: datasourceHealth?.message
          ? `Your tenant Mimir datasource is not ready in Grafana yet. ${datasourceHealth.message}`
          : 'Your tenant Mimir datasource is not ready in Grafana yet. Retry in a few seconds; if it persists, verify GRAFANA_MIMIR_DATASOURCE_URL and Grafana admin credentials.',
        details: datasourceHealth,
      });
    }

    const embedTokenExpiry = config.grafanaEmbedTokenExpiry || '15m';
    const siteFilter = normalizeGrafanaSiteFilter(req.query.site_id ?? req.query.siteId);

    const embedToken = jwt.sign(
      {
        userId,
        purpose: 'grafana-embed',
        dashboard,
        grafanaLogin,
        email: req.user.email || '',
        name: req.user.name || '',
      },
      config.jwt.secret,
      { expiresIn: embedTokenExpiry }
    );

    const baseUrl = resolveGrafanaEmbedPublicBase(req);
    const params = new URLSearchParams({
      embed_token: embedToken,
      'var-user_id': String(userId),
      'var-site_filter': siteFilter,
      from,
      to,
      refresh,
      ...(kiosk === 'tv' || kiosk === 'true' ? { kiosk: 'tv' } : {}),
    });

    const path =
      dashboard === 'metrics' ? `d/${dashboard}/${METRICS_DASHBOARD_SLUG}` : `d/${dashboard}`;
    const url = `${baseUrl}/grafana/${path}?${params.toString()}`;

    if (wantsBrowserRedirect(req)) {
      return res.redirect(302, url);
    }

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
    const uid = decoded.userId;
    if (uid == null) return null;
    return {
      userId: uid,
      grafanaLogin: decoded.grafanaLogin || `vizme_user_${uid}`,
      email: typeof decoded.email === 'string' ? decoded.email : '',
      name: typeof decoded.name === 'string' ? decoded.name : '',
    };
  } catch {
    return null;
  }
}

/**
 * Decode the main app access token (if present) so we can detect stale embed-cookie
 * sessions after account switches/login refreshes.
 */
function getAccessTokenUserId(req) {
  const token = req.cookies?.vizme_access_token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded?.type !== 'access') return null;
    if (decoded?.userId == null) return null;
    return String(decoded.userId);
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

/** Match GF_SERVER_SERVE_FROM_SUB_PATH (default true in docker-compose). */
function buildGrafanaProxyTargetUrl(path, queryStr, upstreamOrigin) {
  const useSubpath = config.grafana?.serveSubpath !== false;
  const prefix = useSubpath ? '/grafana' : '';
  const qs = queryStr ? `?${queryStr}` : '';
  return `${upstreamOrigin}${prefix}${path}${qs}`;
}

function isGrafanaStaticAssetPath(path = '') {
  return /^\/public\/build\//.test(path) || /^\/public\/plugins\//.test(path);
}

function isGrafanaOptionalFeaturePath(path = '') {
  return path.includes('/apis/features.grafana.app/') || path.includes('/ofrep/v1/evaluate/flags');
}

function shouldClearEmbedCookieOnUpstreamAuthFailure(path = '', status) {
  if (status !== 401 && status !== 403) return false;
  if (isGrafanaStaticAssetPath(path) || isGrafanaOptionalFeaturePath(path)) return false;
  return true;
}

/**
 * Proxies requests to Grafana at /grafana/*.
 * Validates embed_token, forces var-user_id from token.
 * Ensures org per user with Mimir datasource (X-Scope-OrgID) for hard isolation.
 */
export async function grafanaProxyMiddleware(req, res, next) {
  const incomingEmbedToken =
    typeof req.query?.embed_token === 'string' ? req.query.embed_token : '';
  const session = validateEmbedToken(req);
  if (!session) {
    if (req.cookies?.[GRAFANA_EMBED_COOKIE]) {
      clearGrafanaEmbedCookie(res);
    }
    return next(new UnauthorizedError('Valid embed token required to view Grafana'));
  }
  const userId = session.userId;
  const accessTokenUserId = getAccessTokenUserId(req);
  if (accessTokenUserId && accessTokenUserId !== String(userId)) {
    // Embed cookie is stale (likely from a previous account/session in this browser).
    // Clearing avoids endless 403 loops until users manually clear cookies.
    clearGrafanaEmbedCookie(res);
    return res.status(401).json({
      success: false,
      code: 'grafana_embed_stale_session',
      retryable: true,
      message: 'Grafana embed session was stale and has been reset. Retry with a fresh embed URL.',
    });
  }

  const grafanaConn = await resolveGrafanaConnection();
  if (!grafanaConn.apiBase) {
    res.removeHeader('X-Frame-Options');
    const frontendOrigin = config.cors.frontendUrl || '';
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frontendOrigin}`);
    return res.status(503).json({
      success: false,
      error: 'Grafana unavailable',
      code: grafanaConn.authFailed ? 'grafana_admin_auth' : 'grafana_unreachable',
      message: grafanaConn.authFailed
        ? 'Grafana admin API rejected credentials. Set GRAFANA_ADMIN_USER/PASSWORD to match Grafana.'
        : 'Could not reach Grafana. If the API runs on the host, set GRAFANA_URL=http://localhost:3001.',
    });
  }
  const upstreamOrigin = grafanaConn.origin;

  const orgId = await ensureGrafanaTenant(userId, { grafanaLogin: session.grafanaLogin });
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
        'Tenant setup failed. Restart backend after code changes: docker compose restart backend. Ensure: (1) Grafana is running, (2) GRAFANA_ADMIN_USER/PASSWORD match Grafana, (3) GRAFANA_MIMIR_DATASOURCE_URL is reachable from Grafana. Verify: GET /health/grafana',
    });
  }

  // Use full path: when mounted at /grafana, req.path is relative; req.baseUrl + req.path = /grafana/api/...
  let path = (req.baseUrl || '') + (req.path || req.url?.split('?')[0] || '/');
  if (path.startsWith('/grafana')) path = path.slice(9) || '/';
  path = '/' + path.replace(/^\/+/, '');

  // Fix path duplication only in datasource proxy paths. Do NOT rewrite Grafana alerting API
  // (/api/prometheus/grafana/api/v1/rules) - that path is intentional.
  if (path.includes('/datasources/proxy/') && path.includes('/grafana/api')) {
    path = path.replace(/\/grafana\/api(?=\/)/g, '/api');
  }

  if (path.includes('/namespaces/org-')) {
    path = path.replace(/\/namespaces\/org-[^/]+/, `/namespaces/org-${orgId}`);
  }

  const query = new URLSearchParams(req.query);
  query.delete('embed_token');
  query.set('var-user_id', String(userId));
  query.set('orgId', String(orgId));
  const queryStr = query.toString();

  let targetUrl = buildGrafanaProxyTargetUrl(path, queryStr, upstreamOrigin);

  // Keep iframe subrequests pinned to the most recent embed URL.
  if (incomingEmbedToken) {
    setGrafanaEmbedCookie(res, incomingEmbedToken);
  }

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers.authorization;
    const publicBase = new URL(
      (config.api.baseUrl || 'http://localhost:3000').replace(/\/$/, '') + '/grafana'
    );
    /** Grafana must receive Host matching the upstream TCP target; wrong Host (e.g. :3000 to :3001) causes 404 on /grafana/d/... */
    let upstreamHost;
    try {
      upstreamHost = new URL(upstreamOrigin).host;
    } catch {
      upstreamHost = 'localhost:3001';
    }
    headers['Host'] = upstreamHost;
    headers['X-Forwarded-Host'] = req.get('host') || publicBase.host;
    headers['X-Forwarded-Proto'] = req.get('x-forwarded-proto') || req.protocol || 'http';
    headers['X-WEBAUTH-USER'] = session.grafanaLogin;
    headers['X-WEBAUTH-ORGS'] = `${orgId}:Admin`;
    headers['X-Grafana-Org-Id'] = String(orgId);
    headers['X-Scope-OrgID'] = String(userId);
    if (session.email) headers['X-WEBAUTH-EMAIL'] = session.email;
    if (session.name) headers['X-WEBAUTH-NAME'] = session.name;

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

    let response = await fetch(targetUrl, fetchOpts);

    if (response.status === 404 && req.method === 'GET' && /^\/d\//.test(path)) {
      logger.warn(
        {
          path,
          userId,
          orgId,
          targetUrl: targetUrl.replace(/embed_token=[^&]+/gi, 'embed_token=***'),
        },
        'Grafana 404 on dashboard route; re-provisioning uid=metrics and retrying once'
      );
      const reprovisioned = await reprovisionTenantDashboard(userId);
      if (reprovisioned) {
        targetUrl = buildGrafanaProxyTargetUrl(path, queryStr, upstreamOrigin);
        response = await fetch(targetUrl, fetchOpts);
      }
    }

    if (response.status === 401 || response.status === 403) {
      const shouldClear = shouldClearEmbedCookieOnUpstreamAuthFailure(path, response.status);
      if (shouldClear) {
        clearGrafanaEmbedCookie(res);
      }
      logger.warn(
        {
          status: response.status,
          path,
          method: req.method,
          userId: String(userId),
          orgId: String(orgId),
          clearedEmbedCookie: shouldClear,
        },
        shouldClear
          ? 'Grafana auth rejection on critical path; cleared embed cookie for recovery'
          : 'Grafana auth rejection on non-critical path; preserved embed cookie'
      );
    }

    if (response.status >= 400) {
      logger.warn(
        {
          status: response.status,
          path,
          targetUrl: targetUrl.replace(/:[^:@]+@/, ':***@'),
          method: req.method,
        },
        'Grafana proxy non-2xx response'
      );
    }

    res.status(response.status);
    const frontendOrigin = config.cors.frontendUrl || '';
    const allowedFrameAncestors = ["'self'", frontendOrigin].filter(Boolean).join(' ');

    response.headers.forEach((v, k) => {
      const lower = k.toLowerCase();
      if (lower === 'x-frame-options' || lower === 'content-security-policy') return;
      if (lower === 'transfer-encoding' || lower === 'content-encoding') return;
      if (lower === 'set-cookie') {
        const existing = res.getHeader('set-cookie');
        const incoming = Array.isArray(v) ? v : [v];
        const merged = [
          ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
          ...incoming,
        ].filter(Boolean);
        if (merged.length > 0) {
          res.setHeader('set-cookie', merged);
        }
        return;
      }
      res.setHeader(k, v);
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

  proxy.on('error', (err, req, socket) => {
    socket.destroy();
  });

  server.on('upgrade', async (req, socket, head) => {
    if (!req.url?.startsWith('/grafana')) return;

    const grafanaConn = await resolveGrafanaConnection();
    if (!grafanaConn.apiBase) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }
    const grafanaBase = grafanaConn.origin;

    const [pathPart, queryPart] = req.url.split('?');
    const query = new URLSearchParams(queryPart || '');
    const cookies = parseCookies(req.headers.cookie);
    const token = query.get('embed_token') || cookies[GRAFANA_EMBED_COOKIE];
    const session = validateEmbedToken(null, { token });

    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const userId = session.userId;

    const orgId = await ensureGrafanaTenant(userId, { grafanaLogin: session.grafanaLogin });
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
    try {
      req.headers.host = new URL(grafanaBase).host;
    } catch {
      req.headers.host = 'localhost:3001';
    }
    req.headers['x-webauth-user'] = session.grafanaLogin;
    req.headers['x-webauth-orgs'] = `${orgId}:Admin`;
    req.headers['x-grafana-org-id'] = String(orgId);
    req.headers['x-scope-orgid'] = String(userId); // Mimir tenant for WebSocket/Live
    if (session.email) req.headers['x-webauth-email'] = session.email;
    if (session.name) req.headers['x-webauth-name'] = session.name;

    proxy.ws(req, socket, head, {
      target: grafanaBase,
      ws: true,
    });
  });
}

export { router as grafanaRoutes };
