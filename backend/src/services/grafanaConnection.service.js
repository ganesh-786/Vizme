import { config } from '../config.js';
import { logger } from '../logger.js';

const DEFAULT_GRAFANA_URL = 'http://localhost:3001';
const SUCCESS_CACHE_TTL_MS = 30_000;
const FAILURE_CACHE_TTL_MS = 5_000;

let cachedConnection = null;
let cacheExpiresAt = 0;
let pendingConnectionPromise = null;

function trimTrailingSlash(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function grafanaServeSubpathEnabled() {
  const raw = process.env.GRAFANA_SERVE_SUBPATH;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return config.grafana?.serveSubpath !== false;
}

function normalizeGrafanaRoot(candidate) {
  const trimmed = trimTrailingSlash(candidate);
  if (!trimmed) return '';
  return trimmed.replace(/\/grafana$/i, '');
}

function expandLoopbackAliases(candidate) {
  const trimmed = trimTrailingSlash(candidate);
  if (!trimmed) return [];

  const variants = [trimmed];
  if (trimmed.includes('://localhost')) {
    variants.push(trimmed.replace('://localhost', '://127.0.0.1'));
  } else if (trimmed.includes('://127.0.0.1')) {
    variants.push(trimmed.replace('://127.0.0.1', '://localhost'));
  }

  return [...new Set(variants)];
}

function expandGrafanaApiBases(candidate) {
  const root = normalizeGrafanaRoot(candidate);
  if (!root || !/^https?:\/\//i.test(root)) return [];

  const preferSubpath = grafanaServeSubpathEnabled();
  const primary = preferSubpath ? `${root}/grafana` : root;
  const alternate = preferSubpath ? root : `${root}/grafana`;

  return [...new Set([primary, alternate].filter(Boolean))];
}

function apiBaseToOrigin(apiBase) {
  return trimTrailingSlash(apiBase).replace(/\/grafana$/i, '');
}

function getPrimaryGrafanaAdminCredentials() {
  return {
    user:
      process.env.GRAFANA_ADMIN_USER ||
      process.env.GF_SECURITY_ADMIN_USER ||
      config.grafana?.adminUser ||
      'admin',
    password:
      process.env.GRAFANA_ADMIN_PASSWORD ||
      process.env.GF_SECURITY_ADMIN_PASSWORD ||
      config.grafana?.adminPassword ||
      'admin',
  };
}

function buildGrafanaAdminCredentialsToTry() {
  const primary = getPrimaryGrafanaAdminCredentials();
  const users = [primary.user];

  if (primary.user === 'admin') {
    users.push('admin@localhost');
  } else if (primary.user === 'admin@localhost') {
    users.push('admin');
  }

  return [...new Set(users)].map((user) => ({ user, password: primary.password }));
}

function setCachedConnection(connection, ttlMs) {
  cachedConnection = connection;
  cacheExpiresAt = Date.now() + ttlMs;
  return connection;
}

export function clearGrafanaConnectionCache() {
  cachedConnection = null;
  cacheExpiresAt = 0;
  pendingConnectionPromise = null;
}

export function grafanaAdminApiHeaders(credentials = null) {
  const { user, password } =
    credentials || cachedConnection?.adminCredentials || getPrimaryGrafanaAdminCredentials();
  const token = Buffer.from(`${user}:${password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

export function buildGrafanaBasesToTry() {
  const rawCandidates = [
    process.env.GRAFANA_INTERNAL_URL,
    process.env.GRAFANA_URL,
    config.urls.grafana,
    DEFAULT_GRAFANA_URL,
  ];

  const bases = [];
  const seen = new Set();

  for (const candidate of rawCandidates) {
    for (const variant of expandLoopbackAliases(candidate)) {
      for (const apiBase of expandGrafanaApiBases(variant)) {
        if (seen.has(apiBase)) continue;
        seen.add(apiBase);
        bases.push(apiBase);
      }
    }
  }

  return bases;
}

async function probeGrafanaApiBase(apiBase) {
  const url = `${apiBase}/api/org`;

  let sawAuthFailure = false;
  let lastFailure = null;

  for (const credentials of buildGrafanaAdminCredentialsToTry()) {
    try {
      const response = await fetch(url, {
        headers: grafanaAdminApiHeaders(credentials),
        redirect: 'manual',
      });

      if (response.ok) {
        return {
          ok: true,
          apiBase,
          origin: apiBaseToOrigin(apiBase),
          adminCredentials: credentials,
        };
      }

      const body = await response.text();
      const authFailed = response.status === 401 || response.status === 403;
      if (authFailed) sawAuthFailure = true;

      logger.warn(
        {
          apiBase,
          status: response.status,
          authFailed,
          adminUser: credentials.user,
          body: body?.slice(0, 200),
        },
        'Grafana connection probe returned non-2xx response'
      );

      lastFailure = {
        ok: false,
        apiBase,
        authFailed,
        status: response.status,
        body,
      };
    } catch (error) {
      logger.warn(
        {
          apiBase,
          err: error.message,
          code: error.cause?.code,
          adminUser: credentials.user,
        },
        'Grafana connection probe failed'
      );

      lastFailure = {
        ok: false,
        apiBase,
        authFailed: false,
        error,
      };
    }
  }

  return lastFailure || {
    ok: false,
    apiBase,
    authFailed: sawAuthFailure,
  };
}

/**
 * Resolve the working Grafana admin API base and the upstream origin used by the proxy.
 * The API base may include `/grafana`, while `origin` never does.
 */
export async function resolveGrafanaConnection(options = {}) {
  const { force = false } = options;

  if (!force && cachedConnection && Date.now() < cacheExpiresAt) {
    return cachedConnection;
  }

  if (!force && pendingConnectionPromise) {
    return pendingConnectionPromise;
  }

  const pending = (async () => {
    const candidates = buildGrafanaBasesToTry();
    let authFailed = false;
    let lastError = null;

    for (const apiBase of candidates) {
      const probe = await probeGrafanaApiBase(apiBase);

      if (probe.ok) {
        return setCachedConnection(
          {
            apiBase: probe.apiBase,
            origin: probe.origin,
            authFailed: false,
            adminCredentials: probe.adminCredentials,
            candidates,
          },
          SUCCESS_CACHE_TTL_MS
        );
      }

      if (probe.authFailed) authFailed = true;
      lastError =
        probe.error?.message ||
        (probe.status ? `HTTP ${probe.status}` : null) ||
        probe.body?.slice(0, 200) ||
        lastError;
    }

    return setCachedConnection(
      {
        apiBase: null,
        origin: null,
        authFailed,
        candidates,
        lastError,
      },
      FAILURE_CACHE_TTL_MS
    );
  })();

  pendingConnectionPromise = pending;

  try {
    return await pending;
  } finally {
    if (pendingConnectionPromise === pending) {
      pendingConnectionPromise = null;
    }
  }
}
