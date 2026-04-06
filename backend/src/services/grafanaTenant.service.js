/**
 * Grafana tenant provisioning for Mimir hard isolation.
 * Creates org + datasource per user with X-Scope-OrgID so each user only sees their metrics.
 *
 * Product-facing charts are rendered in the React app (Recharts) via /api/v1/metrics/dashboard;
 * Grafana here is an optional ops / power-user surface — see docs/VISUALIZATION_AND_GRAFANA.md.
 * Do not treat provisioned Grafana JSON as the source of truth for customer KPI layouts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GRAFANA_BASE_RAW = (
  process.env.GRAFANA_INTERNAL_URL ||
  config.urls.grafana ||
  'http://localhost:3001'
).replace(/\/$/, '');
// Grafana serves from /grafana subpath (serve_from_sub_path=true); API is at /grafana/api/*
const GRAFANA_BASE = GRAFANA_BASE_RAW.includes('/grafana')
  ? GRAFANA_BASE_RAW
  : `${GRAFANA_BASE_RAW}/grafana`;
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
// Use internal hostname when backend runs in Docker (Grafana proxies to this URL)
const PROMETHEUS_URL = (
  process.env.PROMETHEUS_INTERNAL_URL ||
  process.env.PROMETHEUS_URL ||
  config.urls.prometheus ||
  'http://prometheus:9090'
).replace(/\/$/, '');

// Fallback when GRAFANA_INTERNAL_URL fails (e.g. backend runs locally, "grafana" hostname doesn't resolve)
const GRAFANA_FALLBACK_RAW = (config.urls.grafana || 'http://localhost:3001').replace(/\/$/, '');
const GRAFANA_FALLBACK = GRAFANA_FALLBACK_RAW.includes('/grafana')
  ? GRAFANA_FALLBACK_RAW
  : `${GRAFANA_FALLBACK_RAW}/grafana`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const DASHBOARD_UPDATE_COOLDOWN_MS = 60_000; // Skip overwrite if done in last 60s (reduces Grafana API load)
const PROVISION_RETRIES = 10; // Increased for post-volume-reset: Grafana provisioning can be slow
const PROVISION_DELAY_MS = 3000; // Wait longer between retries for Grafana to finish provisioning

const dashboardLastUpdated = new Map(); // orgId -> timestamp

// Log resolved config at module load (helps debug connectivity)
logger.info(
  { grafanaBase: GRAFANA_BASE, mimirUrl: MIMIR_URL, adminUser: ADMIN_USER },
  'Grafana tenant service initialized'
);

// Warmup: bootstrap org 1 dashboard on startup (async, non-blocking)
bootstrapOrg1Dashboard().catch((err) =>
  logger.warn({ err: err?.message }, 'Grafana tenant warmup: bootstrap skipped')
);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function grafanaFetch(path, opts = {}, baseOverride = null) {
  const base = baseOverride || GRAFANA_BASE;
  const url = `${base}${path}`;
  const auth = Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      ...(opts.headers || {}),
    },
  });
  return res;
}

/**
 * Ensure Grafana has org and datasource for user. Creates if missing.
 * Retries with fallback URL when primary Grafana URL fails (e.g. backend local, "grafana" hostname doesn't resolve).
 * @param {string|number} userId - User ID (tenant ID)
 * @returns {Promise<number|null>} - Grafana org ID for this tenant, or null
 */
export async function ensureGrafanaTenant(userId) {
  const uid = String(userId);
  const orgName = `vizme-${uid}`;

  const basesToTry = [GRAFANA_BASE];
  if (GRAFANA_FALLBACK !== GRAFANA_BASE) basesToTry.push(GRAFANA_FALLBACK);

  for (const base of basesToTry) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let orgId = await getOrgIdByName(orgName, base);
        if (!orgId) {
          orgId = await createOrg(orgName, base);
        }
        if (!orgId) {
          if (attempt < MAX_RETRIES) {
            logger.warn({ attempt, base, orgName }, 'createOrg returned null, retrying...');
            await sleep(RETRY_DELAY_MS * attempt);
          }
          continue;
        }

        await ensurePrometheusDatasource(orgId, base);
        await ensureMimirDatasource(orgId, uid, base);
        const dashboardOk = await ensureDashboardInOrg(orgId, uid, base);
        if (!dashboardOk) {
          logger.error({ orgId, userId: uid }, 'ensureGrafanaTenant: dashboard setup failed, not returning org');
          return null;
        }
        return orgId;
      } catch (err) {
        const isConnectError =
          err.cause?.code === 'ECONNREFUSED' ||
          err.cause?.code === 'ENOTFOUND' ||
          err.message?.includes('fetch failed');
        logger.warn(
          { err: err.message, errCode: err.cause?.code, attempt, base, userId: uid },
          'ensureGrafanaTenant attempt failed'
        );
        if (attempt < MAX_RETRIES && isConnectError) {
          await sleep(RETRY_DELAY_MS * attempt);
        } else if (
          attempt === MAX_RETRIES &&
          isConnectError &&
          basesToTry.indexOf(base) < basesToTry.length - 1
        ) {
          // Try next base (fallback)
          break;
        } else if (attempt === MAX_RETRIES) {
          logger.error(
            { err, userId: uid, grafanaBase: base, lastAttempt: true },
            'ensureGrafanaTenant failed - check Grafana reachability and admin credentials'
          );
          return null;
        }
      }
    }
  }

  logger.error('ensureGrafanaTenant failed after all retries and fallbacks');
  return null;
}

async function getOrgIdByName(name, baseOverride = null) {
  const res = await grafanaFetch('/api/orgs/name/' + encodeURIComponent(name), {}, baseOverride);
  if (!res.ok) {
    if (res.status === 404) return null; // Org doesn't exist yet
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
    logger.error(
      { status: res.status, text: text?.slice(0, 300), name },
      'createOrg failed - verify GRAFANA_ADMIN_USER/PASSWORD match Grafana (401=wrong credentials)'
    );
    return null;
  }
  const data = await res.json();
  return data?.orgId ?? data?.id ?? null;
}

async function ensurePrometheusDatasource(orgId, baseOverride = null) {
  const listRes = await grafanaFetch(
    '/api/datasources',
    { headers: { 'X-Grafana-Org-Id': String(orgId) } },
    baseOverride
  );
  if (!listRes.ok) return;
  const list = await listRes.json();
  const existing = list.find((d) => d.uid === 'prometheus' || d.name === 'Prometheus');
  const correctUrl = PROMETHEUS_URL;

  if (existing) {
    if (existing.url !== correctUrl) {
      const updateRes = await grafanaFetch(
        `/api/datasources/${existing.id}`,
        {
          method: 'PUT',
          headers: { 'X-Grafana-Org-Id': String(orgId) },
          body: JSON.stringify({ ...existing, url: correctUrl }),
        },
        baseOverride
      );
      if (!updateRes.ok) {
        logger.warn({ status: updateRes.status, orgId }, 'ensurePrometheusDatasource: update failed');
      }
    }
    return;
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
        jsonData: { timeInterval: '3s' },
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
  }
}

async function ensureMimirDatasource(orgId, tenantId, baseOverride = null) {
  const listRes = await grafanaFetch(
    '/api/datasources',
    { headers: { 'X-Grafana-Org-Id': String(orgId) } },
    baseOverride
  );
  if (!listRes.ok) {
    logger.warn(
      { status: listRes.status, orgId },
      'ensureMimirDatasource: list datasources failed'
    );
    return;
  }
  const list = await listRes.json();
  const existing = list.find((d) => d.name === 'Mimir' || d.uid === `mimir-${tenantId}`);
  const correctUrl = `${MIMIR_URL}/prometheus`;
  const correctJsonData = {
    ...(existing?.jsonData || {}),
    timeInterval: '3s',
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
      }
    }
    return;
  }

  const createRes = await grafanaFetch(
    '/api/datasources',
    {
      method: 'POST',
      headers: { 'X-Grafana-Org-Id': String(orgId) },
      body: JSON.stringify({
        name: 'Mimir',
        type: 'prometheus',
        uid: `mimir-${tenantId}`,
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
      { status: createRes.status, text: text?.slice(0, 300), orgId, tenantId, mimirUrl: MIMIR_URL },
      'ensureMimirDatasource: create failed - verify MIMIR_URL is reachable from Grafana (e.g. http://mimir:8080 in Docker)'
    );
  }
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
      logger.warn({ path: explicitPath, err: err.message }, 'loadDashboardFromFile: explicit path failed');
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
      targets: (p.targets || []).map((t) => ({ ...t, datasource: resolveDs(t.datasource) ?? resolveDs(p.datasource) })),
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
  logger.warn({ status: createRes.status, text: text?.slice(0, 200) }, 'bootstrapOrg1Dashboard: create failed');
  return false;
}

/**
 * Copy metrics dashboard from org 1 to the target org so /d/metrics works.
 * Explicitly binds all panels to the tenant's Mimir datasource for hard isolation.
 * Returns true on success, false on failure. Failure causes ensureGrafanaTenant to return null (503).
 */
async function ensureDashboardInOrg(orgId, tenantId, baseOverride = null) {
  const now = Date.now();
  const last = dashboardLastUpdated.get(orgId) ?? 0;
  if (now - last < DASHBOARD_UPDATE_COOLDOWN_MS) return true; // Already updated recently

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
        targets: (p.targets || []).map((t) => ({ ...t, datasource: resolveDs(t.datasource) ?? panelDs })),
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
    logger.info({ orgId, tenantId, attempt }, 'ensureDashboardInOrg: creating dashboard in user org');
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
