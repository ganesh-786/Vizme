/**
 * Grafana tenant provisioning for Mimir hard isolation.
 * Creates org + datasource per user with X-Scope-OrgID so each user only sees their metrics.
 */
import { config } from '../config.js';
import { logger } from '../logger.js';

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

// Fallback when GRAFANA_INTERNAL_URL fails (e.g. backend runs locally, "grafana" hostname doesn't resolve)
const GRAFANA_FALLBACK_RAW = (config.urls.grafana || 'http://localhost:3001').replace(/\/$/, '');
const GRAFANA_FALLBACK = GRAFANA_FALLBACK_RAW.includes('/grafana')
  ? GRAFANA_FALLBACK_RAW
  : `${GRAFANA_FALLBACK_RAW}/grafana`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const DASHBOARD_UPDATE_COOLDOWN_MS = 60_000; // Skip overwrite if done in last 60s (reduces Grafana API load)

const dashboardLastUpdated = new Map(); // orgId -> timestamp

// Log resolved config at module load (helps debug connectivity)
logger.info(
  { grafanaBase: GRAFANA_BASE, mimirUrl: MIMIR_URL, adminUser: ADMIN_USER },
  'Grafana tenant service initialized'
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

        await ensureMimirDatasource(orgId, uid, base);
        await ensureDashboardInOrg(orgId, uid, base);
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
        logger.warn(
          { status: updateRes.status, orgId, tenantId },
          'ensureMimirDatasource: update URL failed'
        );
      }
    }
    return;
  }

  // Use jsonData for X-Scope-OrgID (not secureJsonData) - some Grafana versions don't
  // reliably send secureJsonData headers; tenant ID is server-enforced by Mimir anyway.
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
        jsonData: {
          httpHeaderName1: 'X-Scope-OrgID',
          httpHeaderValue1: tenantId,
        },
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
 * Copy metrics dashboard from org 1 to the target org so /d/metrics works.
 * Explicitly binds all panels to the tenant's Mimir datasource for hard isolation.
 */
async function ensureDashboardInOrg(orgId, tenantId, baseOverride = null) {
  const now = Date.now();
  const last = dashboardLastUpdated.get(orgId) ?? 0;
  if (now - last < DASHBOARD_UPDATE_COOLDOWN_MS) return;

  const getRes = await grafanaFetch(
    '/api/dashboards/uid/metrics',
    { headers: { 'X-Grafana-Org-Id': '1' } },
    baseOverride
  );
  if (!getRes.ok) {
    logger.warn(
      { status: getRes.status },
      'ensureDashboardInOrg: could not fetch metrics dashboard from org 1'
    );
    return;
  }
  const { dashboard } = await getRes.json();
  if (!dashboard) return;

  const mimirUid = `mimir-${tenantId}`;
  const dsRef = { type: 'prometheus', uid: mimirUid };

  /** Recursively set datasource on all panels and targets (handles row panels with nested panels). */
  function setDatasourceOnPanels(panels) {
    return (panels || []).map((p) => ({
      ...p,
      datasource: dsRef,
      targets: (p.targets || []).map((t) => ({ ...t, datasource: dsRef })),
      ...(p.panels?.length ? { panels: setDatasourceOnPanels(p.panels) } : {}),
    }));
  }
  const panels = setDatasourceOnPanels(dashboard.panels);

  const payload = {
    dashboard: {
      ...dashboard,
      id: null,
      uid: 'metrics',
      panels,
    },
    folderId: 0,
    overwrite: true,
  };

  const createRes = await grafanaFetch(
    '/api/dashboards/db',
    {
      method: 'POST',
      headers: { 'X-Grafana-Org-Id': String(orgId) },
      body: JSON.stringify(payload),
    },
    baseOverride
  );
  if (createRes.ok) {
    dashboardLastUpdated.set(orgId, Date.now());
  } else {
    const text = await createRes.text();
    logger.warn(
      { status: createRes.status, text: text?.slice(0, 200), orgId },
      'ensureDashboardInOrg: create failed'
    );
  }
}
