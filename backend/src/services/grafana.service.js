// backend/src/services/grafana.service.js
import crypto from 'crypto';

export const GRAFANA_URL = process.env.GRAFANA_INTERNAL_URL || 'http://grafana:3000';
export const ADMIN_AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.GRAFANA_ADMIN_USER || 'admin'}:${process.env.GRAFANA_ADMIN_PASSWORD || 'admin'}`
  ).toString('base64');

const headers = {
  'Content-Type': 'application/json',
  Authorization: ADMIN_AUTH,
};

async function fetchWithRetry(url, options, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res; // don't retry 4xx
      throw new Error(`Grafana returned ${res.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Grafana API retry ${i + 1}/${retries} after error: ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

// 1. Create an isolated org for the user
export async function createOrg(name) {
  const res = await fetchWithRetry(`${GRAFANA_URL}/api/orgs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });
  return res.json();
}

// 2. Pre-create the Grafana user directly in their org
export async function createGrafanaUser(email, name, orgId) {
  const res = await fetch(`${GRAFANA_URL}/api/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: name || email,
      email,
      login: email,
      password: crypto.randomBytes(32).toString('hex'), // random, auth is via proxy
      OrgId: orgId, // user is created directly in this org
    }),
  });
  return res.json();
}

// 3. Set user's role in their org
export async function setUserOrgRole(orgId, grafanaUserId, role = 'Editor') {
  await fetch(`${GRAFANA_URL}/api/orgs/${orgId}/users/${grafanaUserId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ role }),
  });
}

// 4. Check whether an org still exists in Grafana (handles volume recreation)
export async function checkOrgExists(orgId) {
  try {
    const res = await fetch(`${GRAFANA_URL}/api/orgs/${orgId}`, { headers });
    return res.ok;
  } catch {
    return false;
  }
}

// 5. Create a datasource in the user's org (pointing to prom-label-proxy)
export async function createDatasourceInOrg(orgId) {
  const res = await fetch(`${GRAFANA_URL}/api/datasources`, {
    method: 'POST',
    headers: { ...headers, 'X-Grafana-Org-Id': orgId.toString() },
    body: JSON.stringify({
      name: 'Prometheus',
      type: 'prometheus',
      access: 'proxy',
      url: 'http://nginx-prom-proxy:80', // prom-label-proxy behind Nginx
      isDefault: true,
      jsonData: {
        timeInterval: '3s',
        keepCookies: ['vizme_grafana_session'],
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create datasource in org ${orgId}: ${res.status} ${body}`);
  }
}

// Build org-scoped headers once
const orgHeaders = (orgId) => ({
  ...headers,
  'X-Grafana-Org-Id': String(orgId),
});

// Fixed UID for your default tenant dashboard
const DEFAULT_DASHBOARD_UID = 'vizme-default';

// Creates a starter timeseries dashboard JSON
function buildDefaultDashboard() {
  return {
    uid: DEFAULT_DASHBOARD_UID,
    title: 'Vizme - Default Metrics',
    schemaVersion: 39,
    version: 1,
    timezone: 'browser',
    refresh: '5s',
    tags: ['vizme', 'default'],
    editable: true,
    time: { from: 'now-1h', to: 'now' },
    panels: [
      // 1) Quick KPI
      {
        id: 1,
        type: 'stat',
        title: 'Active Metric Series',
        gridPos: { h: 6, w: 6, x: 0, y: 0 },
        datasource: 'Prometheus',
        targets: [
          {
            refId: 'A',
            expr: 'count({__name__=~"user_metric_.*"})',
          },
        ],
        options: {
          reduceOptions: { calcs: ['lastNotNull'], values: false },
          colorMode: 'value',
          graphMode: 'none',
        },
      },

      // 2) Counter traffic only (clean rate chart)
      {
        id: 2,
        type: 'timeseries',
        title: 'Request/Event Throughput (per sec)',
        gridPos: { h: 10, w: 18, x: 6, y: 0 },
        datasource: 'Prometheus',
        targets: [
          {
            refId: 'A',
            expr: 'sum by (__name__) (rate({__name__=~"user_metric_.*_total"}[1m]))',
            legendFormat: '{{__name__}}',
          },
        ],
        fieldConfig: {
          defaults: { unit: 'ops' },
          overrides: [],
        },
        options: {
          legend: { displayMode: 'table', placement: 'bottom' },
          tooltip: { mode: 'multi' },
        },
      },

      // 3) Gauge/current values panel (no rate)
      {
        id: 3,
        type: 'timeseries',
        title: 'Current Values (Gauges/Instant Metrics)',
        gridPos: { h: 10, w: 24, x: 0, y: 6 },
        datasource: 'Prometheus',
        targets: [
          {
            refId: 'A',
            expr: '{__name__=~"user_metric_.*",__name__!~".*(_total|_count|_sum|_bucket|_created)$"}',
            legendFormat: '{{__name__}}',
          },
        ],
        options: {
          legend: { displayMode: 'table', placement: 'bottom' },
          tooltip: { mode: 'multi' },
        },
      },
    ],
  };
}

// Ensure dashboard exists in org (idempotent)
export async function ensureDefaultDashboardInOrg(orgId) {
  // 1) Check if dashboard already exists
  const getRes = await fetch(`${GRAFANA_URL}/api/dashboards/uid/${DEFAULT_DASHBOARD_UID}`, {
    method: 'GET',
    headers: orgHeaders(orgId),
  });

  if (getRes.ok) {
    const data = await getRes.json();
    return { id: data.dashboard.id, uid: data.dashboard.uid, created: false };
  }

  if (getRes.status !== 404) {
    const body = await getRes.text();
    throw new Error(`Failed checking default dashboard in org ${orgId}: ${getRes.status} ${body}`);
  }

  // 2) Create dashboard when missing
  const createPayload = {
    dashboard: buildDefaultDashboard(),
    folderId: 0,
    overwrite: false,
    message: 'Create Vizme default dashboard',
  };

  const createRes = await fetchWithRetry(`${GRAFANA_URL}/api/dashboards/db`, {
    method: 'POST',
    headers: orgHeaders(orgId),
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(
      `Failed creating default dashboard in org ${orgId}: ${createRes.status} ${body}`
    );
  }

  const created = await createRes.json();
  return { id: created.id, uid: created.uid, created: true };
}

// Set org home dashboard so opening Grafana lands here
export async function setOrgHomeDashboard(orgId, dashboardUid, dashboardId) {
  const payload = {
    theme: '',
    timezone: '',
    homeDashboardUID: dashboardUid,
    homeDashboardId: dashboardId, // optional but useful for compatibility
  };

  const res = await fetchWithRetry(`${GRAFANA_URL}/api/org/preferences`, {
    method: 'PUT',
    headers: orgHeaders(orgId),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed setting home dashboard for org ${orgId}: ${res.status} ${body}`);
  }
}

// 6. Full setup: called once during signup
export async function setupUserGrafanaOrg(userId, email, name) {
  const org = await createOrg(`vizme-user-${userId}`);
  const user = await createGrafanaUser(email, name, org.orgId);

  await setUserOrgRole(org.orgId, user.id, 'Editor');
  await createDatasourceInOrg(org.orgId);

  const dash = await ensureDefaultDashboardInOrg(org.orgId);
  await setOrgHomeDashboard(org.orgId, dash.uid, dash.id);

  return org.orgId;
}
