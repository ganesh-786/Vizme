import express from 'express';
import jwt from 'jsonwebtoken';
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

    // Make subresource requests work even when the initial iframe URL only includes embed_token in query.
    // Nginx will validate via cookie or query, but browsers won't re-send embed_token query on subsequent requests.
    setGrafanaEmbedCookie(res, embedToken);

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
 * Internal auth endpoint for Nginx `auth_request` used by `/grafana/*` reverse proxy.
 *
 * - Validates embed session (query embed_token or cookie).
 * - Ensures Grafana org/datasource/dashboard tenant exists.
 * - Responds with 204 and the headers Nginx should pass to Grafana.
 *
 * This endpoint is intentionally NOT protected by main JWT auth; the embed token is the auth.
 */
router.get('/_auth', async (req, res) => {
  const session = validateEmbedToken(req);
  if (!session) {
    if (req.cookies?.[GRAFANA_EMBED_COOKIE]) {
      clearGrafanaEmbedCookie(res);
    }
    return res.status(401).end();
  }

  const userId = session.userId;
  const accessTokenUserId = getAccessTokenUserId(req);
  if (accessTokenUserId && accessTokenUserId !== String(userId)) {
    clearGrafanaEmbedCookie(res);
    return res.status(401).end();
  }

  const orgId = await ensureGrafanaTenant(userId, { grafanaLogin: session.grafanaLogin });
  if (!orgId) {
    return res.status(503).end();
  }

  // If embed_token is present in query, keep cookie pinned to the latest value.
  const incomingEmbedToken =
    typeof req.query?.embed_token === 'string' ? req.query.embed_token : '';
  if (incomingEmbedToken) {
    setGrafanaEmbedCookie(res, incomingEmbedToken);
  }

  res.setHeader('X-WEBAUTH-USER', session.grafanaLogin);
  res.setHeader('X-WEBAUTH-ORGS', `${orgId}:Admin`);
  res.setHeader('X-Grafana-Org-Id', String(orgId));
  res.setHeader('X-Scope-OrgID', String(userId));
  if (session.email) res.setHeader('X-WEBAUTH-EMAIL', session.email);
  if (session.name) res.setHeader('X-WEBAUTH-NAME', session.name);

  return res.status(204).end();
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

export { router as grafanaRoutes };
