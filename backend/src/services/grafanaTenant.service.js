/**
 * Grafana tenant provisioning for Mimir hard isolation.
 * Creates org + datasource per user with X-Scope-OrgID so each user only sees their metrics.
 *
 * Product-facing charts are embedded Grafana (uid: metrics) via /grafana proxy; KPI summaries also use /api/v1/metrics/dashboard;
 * Grafana here is an optional ops / power-user surface — see docs/VISUALIZATION_AND_GRAFANA.md.
 * Do not treat provisioned Grafana JSON as the source of truth for customer KPI layouts.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { recordGrafanaDatasourceHealth } from '../middleware/appMetrics.js';
import {
  resolveGrafanaConnection,
  clearGrafanaConnectionCache,
  buildGrafanaBasesToTry,
  grafanaAdminApiHeaders,
} from './grafanaConnection.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use GRAFANA_ADMIN_* or GF_SECURITY_ADMIN_* (docker-compose uses GF_* for Grafana)
const ADMIN_USER =
  config.grafana?.adminUser ||
  process.env.GRAFANA_ADMIN_USER ||
  process.env.GF_SECURITY_ADMIN_USER ||
  'admin';
const ADMIN_PASS =
  config.grafana?.adminPassword ||
  process.env.GRAFANA_ADMIN_PASSWORD ||
  process.env.GF_SECURITY_ADMIN_PASSWORD ||
  'admin';
const MIMIR_URL = (config.urls.mimir || process.env.MIMIR_URL || 'http://localhost:9009').replace(
  /\/$/,
  ''
);
const GRAFANA_MIMIR_URL = (
  config.grafana?.mimirDatasourceUrl ||
  process.env.GRAFANA_MIMIR_DATASOURCE_URL ||
  'http://mimir:8080'
).replace(/\/$/, '');
// Use internal hostname when backend runs in Docker (Grafana proxies to this URL)
const PROMETHEUS_URL = (
  process.env.PROMETHEUS_INTERNAL_URL ||
  process.env.PROMETHEUS_URL ||
  config.urls.prometheus ||
  'http://prometheus:9090'
).replace(/\/$/, '');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const DASHBOARD_UPDATE_COOLDOWN_MS = 60_000; // Skip overwrite if done in last 60s (reduces Grafana API load)
const PROVISION_RETRIES = 10; // Increased for post-volume-reset: Grafana provisioning can be slow
const PROVISION_DELAY_MS = 3000; // Wait longer between retries for Grafana to finish provisioning
const DATASOURCE_INTERVAL = '15s';

const dashboardLastUpdated = new Map(); // orgId -> timestamp

logger.info(
  {
    grafanaCandidates: buildGrafanaBasesToTry(),
    mimirUrl: MIMIR_URL,
    grafanaMimirUrl: GRAFANA_MIMIR_URL,
    adminUser: ADMIN_USER,
  },
  'Grafana tenant service initialized (connection resolved on first use)'
);

export function getExpectedMimirDatasourceUrl() {
  return `${GRAFANA_MIMIR_URL}/prometheus`;
}

export function getExpectedPrometheusDatasourceUrl() {
  return PROMETHEUS_URL;
}

// Warmup: bootstrap org 1 dashboard on startup (async, non-blocking)
bootstrapOrg1Dashboard().catch((err) =>
  logger.warn({ err: err?.message }, 'Grafana tenant warmup: bootstrap skipped')
);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function grafanaFetch(path, opts = {}, baseOverride = null) {
  let base = baseOverride;
  if (!base) {
    const conn = await resolveGrafanaConnection();
    base = conn.apiBase;
  }
  if (!base) {
    throw new Error('GRAFANA_UNREACHABLE');
  }
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...grafanaAdminApiHeaders(),
      ...(opts.headers || {}),
    },
  });
  return res;
}

/**
 * Auth-proxy headers (X-WEBAUTH-ORGS) do not reliably grant access to non-default orgs in Grafana OSS.
 * Ensures the Grafana user exists and is an Admin in the tenant org via the Admin HTTP API.
 */
async function ensureAuthProxyUserInOrg(grafanaLogin, orgId, baseOverride = null) {
  if (!grafanaLogin || String(grafanaLogin).trim() === '') return;
  const login = String(grafanaLogin).trim();

  try {
    const lookupRes = await grafanaFetch(
      '/api/users/lookup?loginOrEmail=' + encodeURIComponent(login),
      {},
      baseOverride
    );

    if (lookupRes.ok) {
      const addRes = await grafanaFetch(
        `/api/orgs/${orgId}/users`,
        {
          method: 'POST',
          body: JSON.stringify({ loginOrEmail: login, role: 'Admin' }),
        },
        baseOverride
      );
      if (addRes.ok) {
        logger.info(
          { orgId, login },
          'ensureAuthProxyUserInOrg: added existing user to tenant org'
        );
        return;
      }
      const addText = await addRes.text();
      if (
        addRes.status === 409 ||
        addRes.status === 412 ||
        /already in organization|already exists|duplicate/i.test(addText || '')
      ) {
        return;
      }
      logger.warn(
        { status: addRes.status, orgId, login, body: addText?.slice(0, 200) },
        'ensureAuthProxyUserInOrg: add existing user to org failed'
      );
      return;
    }

    if (lookupRes.status !== 404) {
      const t = await lookupRes.text();
      logger.warn(
        { status: lookupRes.status, body: t?.slice(0, 200) },
        'ensureAuthProxyUserInOrg: user lookup failed'
      );
      return;
    }

    const randomPass = crypto.randomBytes(32).toString('base64url');
    const emailForGrafana = login.includes('@') ? login : `${login}@vizme.local`;
    const adminUserPayload = {
      name: login.includes('@') ? login.split('@')[0] : login,
      email: emailForGrafana,
      login,
      password: randomPass,
      OrgId: orgId,
    };

    const createRes = await grafanaFetch(
      '/api/admin/users',
      {
        method: 'POST',
        body: JSON.stringify(adminUserPayload),
      },
      baseOverride
    );
    if (createRes.ok) {
      logger.info({ orgId, login }, 'ensureAuthProxyUserInOrg: created Grafana user in tenant org');
      return;
    }

    const createText = await createRes.text();
    if (/already exists|duplicate|login already|email already/i.test(createText || '')) {
      const retryAdd = await grafanaFetch(
        `/api/orgs/${orgId}/users`,
        {
          method: 'POST',
          body: JSON.stringify({ loginOrEmail: login, role: 'Admin' }),
        },
        baseOverride
      );
      if (retryAdd.ok || retryAdd.status === 409) {
        logger.info(
          { orgId, login },
          'ensureAuthProxyUserInOrg: added user to org after create race'
        );
        return;
      }
      const retryText = await retryAdd.text();
      logger.warn(
        { status: retryAdd.status, orgId, login, body: retryText?.slice(0, 200) },
        'ensureAuthProxyUserInOrg: add after duplicate failed'
      );
      return;
    }

    logger.warn(
      { status: createRes.status, orgId, login, body: createText?.slice(0, 300) },
      'ensureAuthProxyUserInOrg: admin create user failed'
    );
  } catch (err) {
    logger.warn({ err: err.message, orgId, login }, 'ensureAuthProxyUserInOrg: error');
  }
}

/**
 * Ensure Grafana has org and datasource for user. Creates if missing.
 * Retries with fallback URL when primary Grafana URL fails (e.g. backend local, "grafana" hostname doesn't resolve).
 * @param {string|number} userId - User ID (tenant ID)
 * @param {{ grafanaLogin?: string }} [options] - Grafana auth-proxy login (email or vizme_user_{id}); required for tenant org access
 * @returns {Promise<number|null>} - Grafana org ID for this tenant, or null
 */
export async function ensureGrafanaTenant(userId, options = {}) {
  const uid = String(userId);
  const orgName = `vizme-${uid}`;

  const runOnce = async (base) => {
    let orgId = await getOrgIdByName(orgName, base);
    if (!orgId) {
      orgId = await createOrg(orgName, base);
    }
    if (!orgId) {
      return null;
    }

    const prometheusOk = await ensurePrometheusDatasource(orgId, base);
    if (!prometheusOk) {
      logger.error({ orgId, userId: uid }, 'ensureGrafanaTenant: prometheus datasource not ready');
      return null;
    }

    const mimirOk = await ensureMimirDatasource(orgId, uid, base);
    if (!mimirOk) {
      logger.error({ orgId, userId: uid }, 'ensureGrafanaTenant: mimir datasource not ready');
      return null;
    }

    const dashboardOk = await ensureDashboardInOrg(orgId, uid, base);
    if (!dashboardOk) {
      logger.error(
        { orgId, userId: uid },
        'ensureGrafanaTenant: dashboard setup failed, not returning org'
      );
      return null;
    }
    if (options.grafanaLogin) {
      await ensureAuthProxyUserInOrg(options.grafanaLogin, orgId, base);
    }
    return orgId;
  };

  for (let round = 0; round < 2; round++) {
    const conn = await resolveGrafanaConnection({ force: round > 0 });
    if (!conn?.apiBase) {
      return null;
    }
    const base = conn.apiBase;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const orgId = await runOnce(base);
        if (orgId) return orgId;
        if (attempt < MAX_RETRIES) {
          logger.warn(
            { attempt, base, orgName },
            'ensureGrafanaTenant: org not ready, retrying...'
          );
          await sleep(RETRY_DELAY_MS * attempt);
        }
      } catch (err) {
        if (err.message === 'GRAFANA_ADMIN_AUTH_FAILED') {
          logger.error({ userId: uid }, 'ensureGrafanaTenant: Grafana admin credentials invalid');
          return null;
        }
        const isConnectError =
          err.message === 'GRAFANA_UNREACHABLE' ||
          err.cause?.code === 'ECONNREFUSED' ||
          err.cause?.code === 'ENOTFOUND' ||
          err.message?.includes('fetch failed');
        logger.warn(
          { err: err.message, errCode: err.cause?.code, attempt, base, userId: uid },
          'ensureGrafanaTenant attempt failed'
        );
        if (isConnectError) {
          clearGrafanaConnectionCache();
        }
        if (attempt < MAX_RETRIES && isConnectError) {
          await sleep(RETRY_DELAY_MS * attempt);
        } else if (attempt === MAX_RETRIES) {
          logger.error(
            { err, userId: uid, grafanaBase: base, lastAttempt: true },
            'ensureGrafanaTenant failed - check Grafana reachability'
          );
          if (isConnectError && round === 0) {
            break;
          }
          return null;
        }
      }
    }
  }

  logger.error('ensureGrafanaTenant failed after retries');
  return null;
}

async function getOrgIdByName(name, baseOverride = null) {
  const res = await grafanaFetch('/api/orgs/name/' + encodeURIComponent(name), {}, baseOverride);
  if (!res.ok) {
    if (res.status === 404) return null; // Org doesn't exist yet
    if (res.status === 401 || res.status === 403) {
      await res.text();
      throw new Error('GRAFANA_ADMIN_AUTH_FAILED');
    }
    const text = await res.text();
    logger.warn({ status: res.status, text: text?.slice(0, 200), name }, 'getOrgIdByName failed');
    return null;
  }
  const data = await res.json();
  return data?.id ?? null;
}

async function createOrg(name, baseOverride = null) {
  const res = await grafanaFetch(
    '/api/orgs',
    { method: 'POST', body: JSON.stringify({ name }) },
    baseOverride
  );
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      logger.error(
        { status: res.status, text: text?.slice(0, 300), name },
        'createOrg: Grafana admin API rejected credentials'
      );
      throw new Error('GRAFANA_ADMIN_AUTH_FAILED');
    }
    logger.error(
      { status: res.status, text: text?.slice(0, 300), name },
      'createOrg failed - verify GRAFANA_ADMIN_USER/PASSWORD match Grafana'
    );
    return null;
  }
  const data = await res.json();
  return data?.orgId ?? data?.id ?? null;
}

async function listOrgDatasources(orgId, baseOverride = null) {
  const listRes = await grafanaFetch(
    '/api/datasources',
    { headers: { 'X-Grafana-Org-Id': String(orgId) } },
    baseOverride
  );
  if (!listRes.ok) {
    logger.warn({ status: listRes.status, orgId }, 'listOrgDatasources failed');
    return null;
  }
  return listRes.json();
}

async function getDatasourceByUid(orgId, uid, baseOverride = null) {
  const res = await grafanaFetch(
    `/api/datasources/uid/${encodeURIComponent(uid)}`,
    { headers: { 'X-Grafana-Org-Id': String(orgId) } },
    baseOverride
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    logger.warn(
      { status: res.status, orgId, uid, body: text?.slice(0, 200) },
      'getDatasourceByUid failed'
    );
    return null;
  }
  return res.json();
}

async function deleteDatasourceById(orgId, datasourceId, baseOverride = null) {
  const res = await grafanaFetch(
    `/api/datasources/${datasourceId}`,
    {
      method: 'DELETE',
      headers: { 'X-Grafana-Org-Id': String(orgId) },
    },
    baseOverride
  );
  if (res.ok || res.status === 404) return true;
  const text = await res.text();
  logger.warn(
    { status: res.status, orgId, datasourceId, body: text?.slice(0, 200) },
    'deleteDatasourceById failed'
  );
  return false;
}

export async function inspectDatasourceHealthInOrg(orgId, uid, baseOverride = null) {
  const startedAt = Date.now();
  const datasource = await getDatasourceByUid(orgId, uid, baseOverride);
  const metricDatasource = uid.startsWith('mimir-') ? 'mimir_tenant' : uid;
  const expectedUrl =
    uid === 'prometheus'
      ? getExpectedPrometheusDatasourceUrl()
      : uid === 'mimir' || uid.startsWith('mimir-')
        ? getExpectedMimirDatasourceUrl()
        : null;
  if (!datasource) {
    recordGrafanaDatasourceHealth({
      datasource: metricDatasource,
      durationMs: Date.now() - startedAt,
      outcome: 'error',
      status: 'missing',
      error: 'Datasource not found',
      url: null,
    });
    return {
      ok: false,
      uid,
      orgId,
      status: 'missing',
      httpStatus: 404,
      message: 'Datasource not found',
      url: null,
    };
  }

  if (expectedUrl && datasource.url !== expectedUrl) {
    const message = `Datasource URL mismatch: expected ${expectedUrl}, found ${datasource.url}`;
    recordGrafanaDatasourceHealth({
      datasource: metricDatasource,
      durationMs: Date.now() - startedAt,
      outcome: 'error',
      status: 'misconfigured',
      error: message,
      url: datasource.url || null,
    });
    return {
      ok: false,
      uid,
      orgId,
      status: 'misconfigured',
      httpStatus: 200,
      message,
      url: datasource.url || null,
      expectedUrl,
    };
  }

  const res = await grafanaFetch(
    `/api/datasources/uid/${encodeURIComponent(uid)}/health`,
    { headers: { 'X-Grafana-Org-Id': String(orgId) } },
    baseOverride
  );
  if (!res.ok) {
    const text = await res.text();
    recordGrafanaDatasourceHealth({
      datasource: metricDatasource,
      durationMs: Date.now() - startedAt,
      outcome: 'error',
      status: `HTTP ${res.status}`,
      error: text,
      url: datasource.url || null,
    });
    logger.warn(
      { status: res.status, orgId, uid, body: text?.slice(0, 200) },
      'verifyDatasourceHealth failed'
    );
    return {
      ok: false,
      uid,
      orgId,
      status: 'error',
      httpStatus: res.status,
      message: text?.slice(0, 200) || 'Grafana datasource health failed',
      url: datasource.url || null,
    };
  }

  const data = await res.json().catch(() => null);
  const ok = data?.status === 'OK';
  recordGrafanaDatasourceHealth({
    datasource: metricDatasource,
    durationMs: Date.now() - startedAt,
    outcome: ok ? 'success' : 'error',
    status: data?.status || 'unknown',
    error: ok ? null : data?.message || 'Grafana datasource returned unhealthy status',
    url: datasource.url || null,
  });
  return {
    ok,
    uid,
    orgId,
    status: data?.status || 'unknown',
    httpStatus: 200,
    message: data?.message || null,
    url: datasource.url || null,
    expectedUrl,
  };
}

async function verifyDatasourceHealth(orgId, uid, baseOverride = null) {
  const health = await inspectDatasourceHealthInOrg(orgId, uid, baseOverride);
  return health.ok;
}

async function ensurePrometheusDatasource(orgId, baseOverride = null) {
  const list = await listOrgDatasources(orgId, baseOverride);
  if (!list) return false;

  const expectedUid = 'prometheus';
  const legacyByName = list.find((d) => d.name === 'Prometheus' && d.uid !== expectedUid);
  if (legacyByName) {
    logger.warn(
      { orgId, foundUid: legacyByName.uid },
      'ensurePrometheusDatasource: deleting datasource with unexpected uid'
    );
    const deleted = await deleteDatasourceById(orgId, legacyByName.id, baseOverride);
    if (!deleted) return false;
  }

  const existing = list.find((d) => d.uid === expectedUid);
  const correctUrl = getExpectedPrometheusDatasourceUrl();
  const correctJsonData = {
    ...(existing?.jsonData || {}),
    timeInterval: DATASOURCE_INTERVAL,
  };

  if (existing) {
    const needsUpdate =
      existing.url !== correctUrl || existing?.jsonData?.timeInterval !== DATASOURCE_INTERVAL;
    if (needsUpdate) {
      const updateRes = await grafanaFetch(
        `/api/datasources/${existing.id}`,
        {
          method: 'PUT',
          headers: { 'X-Grafana-Org-Id': String(orgId) },
          body: JSON.stringify({ ...existing, url: correctUrl, jsonData: correctJsonData }),
        },
        baseOverride
      );
      if (!updateRes.ok) {
        logger.warn(
          { status: updateRes.status, orgId },
          'ensurePrometheusDatasource: update failed'
        );
        return false;
      }
    }
    return Boolean(await getDatasourceByUid(orgId, expectedUid, baseOverride));
  }

  const createRes = await grafanaFetch(
    '/api/datasources',
    {
      method: 'POST',
      headers: { 'X-Grafana-Org-Id': String(orgId) },
      body: JSON.stringify({
        name: 'Prometheus',
        type: 'prometheus',
        uid: 'prometheus',
        url: correctUrl,
        access: 'proxy',
        isDefault: false,
        version: 1,
        editable: false,
        jsonData: { timeInterval: DATASOURCE_INTERVAL },
      }),
    },
    baseOverride
  );
  if (!createRes.ok) {
    const text = await createRes.text();
    logger.error(
      { status: createRes.status, text: text?.slice(0, 200), orgId },
      'ensurePrometheusDatasource: create failed'
    );
    return false;
  }
  return Boolean(await getDatasourceByUid(orgId, expectedUid, baseOverride));
}

async function ensureMimirDatasource(orgId, tenantId, baseOverride = null) {
  const list = await listOrgDatasources(orgId, baseOverride);
  if (!list) return false;

  const expectedUid = `mimir-${tenantId}`;
  const legacyByName = list.find((d) => d.name === 'Mimir' && d.uid !== expectedUid);
  if (legacyByName) {
    logger.warn(
      { orgId, tenantId, foundUid: legacyByName.uid },
      'ensureMimirDatasource: deleting datasource with unexpected uid'
    );
    const deleted = await deleteDatasourceById(orgId, legacyByName.id, baseOverride);
    if (!deleted) return false;
  }

  const existing = list.find((d) => d.uid === expectedUid);
  const correctUrl = getExpectedMimirDatasourceUrl();
  const correctJsonData = {
    ...(existing?.jsonData || {}),
    timeInterval: DATASOURCE_INTERVAL,
    httpHeaderName1: 'X-Scope-OrgID',
  };
  const correctSecureJsonData = { httpHeaderValue1: tenantId };

  if (existing) {
    const urlMismatch = existing.url !== correctUrl;
    const needsUpdate = urlMismatch;

    if (needsUpdate) {
      const updateRes = await grafanaFetch(
        `/api/datasources/${existing.id}`,
        {
          method: 'PUT',
          headers: { 'X-Grafana-Org-Id': String(orgId) },
          body: JSON.stringify({
            ...existing,
            url: correctUrl,
            jsonData: correctJsonData,
            secureJsonData: correctSecureJsonData,
          }),
        },
        baseOverride
      );
      if (!updateRes.ok) {
        logger.warn(
          { status: updateRes.status, orgId, tenantId },
          'ensureMimirDatasource: update failed'
        );
        return false;
      }
    } else {
      const updateRes = await grafanaFetch(
        `/api/datasources/${existing.id}`,
        {
          method: 'PUT',
          headers: { 'X-Grafana-Org-Id': String(orgId) },
          body: JSON.stringify({
            ...existing,
            jsonData: correctJsonData,
            secureJsonData: correctSecureJsonData,
          }),
        },
        baseOverride
      );
      if (!updateRes.ok) {
        logger.warn(
          { status: updateRes.status, orgId, tenantId },
          'ensureMimirDatasource: update X-Scope-OrgID failed'
        );
        return false;
      }
    }
    return Boolean(await getDatasourceByUid(orgId, expectedUid, baseOverride));
  }

  const createRes = await grafanaFetch(
    '/api/datasources',
    {
      method: 'POST',
      headers: { 'X-Grafana-Org-Id': String(orgId) },
      body: JSON.stringify({
        name: 'Mimir',
        type: 'prometheus',
        uid: expectedUid,
        url: correctUrl,
        access: 'proxy',
        isDefault: true,
        version: 1,
        editable: false,
        jsonData: correctJsonData,
        secureJsonData: correctSecureJsonData,
      }),
    },
    baseOverride
  );
  if (!createRes.ok) {
    const text = await createRes.text();
    logger.error(
      {
        status: createRes.status,
        text: text?.slice(0, 300),
        orgId,
        tenantId,
        grafanaMimirUrl: GRAFANA_MIMIR_URL,
      },
      'ensureMimirDatasource: create failed - verify GRAFANA_MIMIR_DATASOURCE_URL is reachable from Grafana (e.g. http://mimir:8080 in Docker)'
    );
    return false;
  }
  return Boolean(await getDatasourceByUid(orgId, expectedUid, baseOverride));
}

/**
 * Load dashboard JSON from file (fallback when Grafana API returns 404).
 * Path: DASHBOARD_JSON_PATH env, or relative to project root (docker/grafana/dashboards/metrics-dashboard.json).
 */
function loadDashboardFromFile() {
  const explicitPath = process.env.DASHBOARD_JSON_PATH;
  if (explicitPath) {
    try {
      const content = fs.readFileSync(explicitPath, 'utf8');
      const parsed = JSON.parse(content);
      return parsed?.dashboard ?? parsed;
    } catch (err) {
      logger.warn(
        { path: explicitPath, err: err.message },
        'loadDashboardFromFile: explicit path failed'
      );
      return null;
    }
  }
  // Fallback: try relative paths (works when backend has grafana/dashboards mounted or cwd is project root)
  const candidates = [
    path.join(__dirname, '../../../docker/grafana/dashboards/metrics-dashboard.json'),
    path.join(process.cwd(), 'docker/grafana/dashboards/metrics-dashboard.json'),
    path.join(process.cwd(), 'grafana/dashboards/metrics-dashboard.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(content);
        return parsed?.dashboard ?? parsed;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/** Bootstrap: ensure org 1 has metrics dashboard (create from file if missing). Idempotent. */
async function bootstrapOrg1Dashboard(baseOverride = null) {
  const getRes = await grafanaFetch(
    '/api/dashboards/uid/metrics',
    { headers: { 'X-Grafana-Org-Id': '1' } },
    baseOverride
  );
  if (getRes.ok) return true;

  const dashboard = loadDashboardFromFile();
  if (!dashboard) {
    logger.warn('bootstrapOrg1Dashboard: no dashboard file, skipping bootstrap');
    return false;
  }

  const mimirRef = { type: 'prometheus', uid: 'mimir' };
  const prometheusRef = { type: 'prometheus', uid: 'prometheus' };
  function resolveDs(original) {
    const uid = original?.uid ?? original;
    return uid === 'prometheus' ? prometheusRef : mimirRef;
  }
  function setDatasourceOnPanels(panels) {
    return (panels || []).map((p) => ({
      ...p,
      datasource: resolveDs(p.datasource),
      targets: (p.targets || []).map((t) => ({
        ...t,
        datasource: resolveDs(t.datasource) ?? resolveDs(p.datasource),
      })),
      ...(p.panels?.length ? { panels: setDatasourceOnPanels(p.panels) } : {}),
    }));
  }

  const { id, meta, ...dashboardRest } = dashboard;
  const payload = {
    dashboard: {
      ...dashboardRest,
      id: null,
      uid: 'metrics',
      version: 1,
      panels: setDatasourceOnPanels(dashboard.panels),
    },
    folderId: 0,
    overwrite: true,
  };

  const createRes = await grafanaFetch(
    '/api/dashboards/db',
    {
      method: 'POST',
      headers: { 'X-Grafana-Org-Id': '1' },
      body: JSON.stringify(payload),
    },
    baseOverride
  );
  if (createRes.ok) {
    logger.info('bootstrapOrg1Dashboard: created metrics dashboard in org 1');
    return true;
  }
  const text = await createRes.text();
  logger.warn(
    { status: createRes.status, text: text?.slice(0, 200) },
    'bootstrapOrg1Dashboard: create failed'
  );
  return false;
}

/**
 * Copy metrics dashboard from org 1 to the target org so /d/metrics works.
 * Explicitly binds all panels to the tenant's Mimir datasource for hard isolation.
 * Returns true on success, false on failure. Failure causes ensureGrafanaTenant to return null (503).
 */
async function ensureDashboardInOrg(orgId, tenantId, baseOverride = null, force = false) {
  const now = Date.now();
  const last = dashboardLastUpdated.get(orgId) ?? 0;
  if (!force && now - last < DASHBOARD_UPDATE_COOLDOWN_MS) return true; // Already updated recently

  let dashboard = null;

  // 0. Bootstrap: ensure org 1 has dashboard (create from file if provisioning failed)
  await bootstrapOrg1Dashboard(baseOverride);

  // 1. Try Grafana API (org 1)
  for (let attempt = 1; attempt <= PROVISION_RETRIES; attempt++) {
    const getRes = await grafanaFetch(
      '/api/dashboards/uid/metrics',
      { headers: { 'X-Grafana-Org-Id': '1' } },
      baseOverride
    );
    if (getRes.ok) {
      const data = await getRes.json();
      dashboard = data?.dashboard ?? null;
      if (dashboard) break;
    }
    if (attempt < PROVISION_RETRIES) {
      logger.info(
        { status: getRes?.status, attempt, maxAttempts: PROVISION_RETRIES },
        'ensureDashboardInOrg: dashboard not in org 1, waiting...'
      );
      await sleep(PROVISION_DELAY_MS);
    }
  }

  // 2. Fallback: load from file
  if (!dashboard) {
    dashboard = loadDashboardFromFile();
    if (dashboard) {
      logger.info({ orgId, tenantId }, 'ensureDashboardInOrg: using dashboard from file');
    }
  }

  if (!dashboard) {
    logger.error(
      { orgId, tenantId },
      'ensureDashboardInOrg: metrics dashboard unavailable. Set DASHBOARD_JSON_PATH or mount docker/grafana/dashboards.'
    );
    return false;
  }

  const mimirUid = `mimir-${tenantId}`;
  const prometheusRef = { type: 'prometheus', uid: 'prometheus' };
  const mimirRef = { type: 'prometheus', uid: mimirUid };

  function resolveDs(original) {
    const uid = original?.uid ?? original;
    return uid === 'prometheus' ? prometheusRef : mimirRef;
  }

  function setDatasourceOnPanels(panels) {
    return (panels || []).map((p) => {
      const panelDs = resolveDs(p.datasource);
      return {
        ...p,
        datasource: panelDs,
        targets: (p.targets || []).map((t) => ({
          ...t,
          datasource: resolveDs(t.datasource) ?? panelDs,
        })),
        ...(p.panels?.length ? { panels: setDatasourceOnPanels(p.panels) } : {}),
      };
    });
  }
  const panels = setDatasourceOnPanels(dashboard.panels);

  // Sanitize: Grafana create API requires id:null, version:1 for new dashboards
  const { id, meta, ...dashboardRest } = dashboard;
  const payload = {
    dashboard: {
      ...dashboardRest,
      id: null,
      uid: 'metrics',
      version: 1,
      panels,
    },
    folderId: 0,
    overwrite: true,
  };

  const CREATE_RETRIES = 3;
  for (let attempt = 1; attempt <= CREATE_RETRIES; attempt++) {
    logger.info(
      { orgId, tenantId, attempt },
      'ensureDashboardInOrg: creating dashboard in user org'
    );
    const createRes = await grafanaFetch(
      '/api/dashboards/db',
      {
        method: 'POST',
        headers: { 'X-Grafana-Org-Id': String(orgId) },
        body: JSON.stringify(payload),
      },
      baseOverride
    );
    const createBody = await createRes.text();
    if (createRes.ok) {
      // Verify dashboard exists (Grafana can return 200 for invalid requests)
      const verifyRes = await grafanaFetch(
        '/api/dashboards/uid/metrics',
        { headers: { 'X-Grafana-Org-Id': String(orgId) } },
        baseOverride
      );
      if (verifyRes.ok) {
        dashboardLastUpdated.set(orgId, Date.now());
        logger.info({ orgId, tenantId }, 'ensureDashboardInOrg: dashboard created and verified');
        return true;
      }
      logger.warn(
        { orgId, tenantId, createStatus: createRes.status, verifyStatus: verifyRes.status },
        'ensureDashboardInOrg: create returned 200 but dashboard not found, retrying...'
      );
    } else {
      logger.warn(
        { status: createRes.status, attempt, orgId, body: createBody?.slice(0, 300) },
        'ensureDashboardInOrg: create failed, retrying...'
      );
    }
    if (attempt < CREATE_RETRIES) await sleep(1000 * attempt);
  }
  logger.error({ orgId, tenantId }, 'ensureDashboardInOrg: create failed after retries');
  return false;
}

/**
 * Clears the per-org dashboard cooldown and re-copies uid=metrics into the tenant org.
 * Used when Grafana returns 404 for /d/... (missing dashboard, volume reset, or manual delete).
 */
export async function reprovisionTenantDashboard(userId) {
  const uid = String(userId);
  const orgName = `vizme-${uid}`;
  const conn = await resolveGrafanaConnection();
  const basesToTry = conn.apiBase
    ? [conn.apiBase, ...buildGrafanaBasesToTry().filter((b) => b !== conn.apiBase)]
    : buildGrafanaBasesToTry();

  for (const base of basesToTry) {
    const orgId = await getOrgIdByName(orgName, base);
    if (!orgId) {
      logger.warn({ userId: uid, base }, 'reprovisionTenantDashboard: org not found');
      continue;
    }
    const prometheusOk = await ensurePrometheusDatasource(orgId, base);
    const mimirOk = await ensureMimirDatasource(orgId, uid, base);
    if (!prometheusOk || !mimirOk) {
      logger.error(
        { userId: uid, orgId, prometheusOk, mimirOk },
        'reprovisionTenantDashboard: datasources not ready'
      );
      continue;
    }
    dashboardLastUpdated.delete(orgId);
    const ok = await ensureDashboardInOrg(orgId, uid, base, true);
    if (ok) {
      logger.info({ userId: uid, orgId }, 'reprovisionTenantDashboard: success');
      return true;
    }
  }
  logger.error({ userId: uid }, 'reprovisionTenantDashboard: failed');
  return false;
}

/**
 * Admin API check: uid=metrics exists in the given org (used before returning embed URLs).
 */
export async function verifyMetricsDashboardInOrg(orgId, baseOverride = null) {
  try {
    const res = await grafanaFetch(
      '/api/dashboards/uid/metrics',
      { headers: { 'X-Grafana-Org-Id': String(orgId) } },
      baseOverride
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function verifyMimirDatasourceInOrg(orgId, tenantId, baseOverride = null) {
  const uid = `mimir-${tenantId}`;
  const health = await inspectDatasourceHealthInOrg(orgId, uid, baseOverride);
  return health.ok;
}
