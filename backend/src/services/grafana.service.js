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

// 6. Full setup: called once during signup
export async function setupUserGrafanaOrg(userId, email, name) {
  const org = await createOrg(`vizme-user-${userId}`);
  const user = await createGrafanaUser(email, name, org.orgId);
  await setUserOrgRole(org.orgId, user.id, 'Editor');
  await createDatasourceInOrg(org.orgId);
  return org.orgId;
}
