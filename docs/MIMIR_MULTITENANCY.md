# Mimir Multi-Tenancy with Hard Isolation

Vizme uses **Grafana Mimir** for production-grade multi-tenant metrics with **hard tenant isolation**.

## Architecture

```
Client (vizme.js) → POST /api/v1/metrics (API key)
       ↓
Backend validates, records in prom-client (cardinality tracking), batch-pushes to Mimir with X-Scope-OrgID = user_id
       ↓
Mimir stores metrics per tenant (user_id) — hard isolation
       ↓
Prometheus scrapes /metrics → app metrics only (no user data)
       ↓
Grafana: one org per user, datasource with X-Scope-OrgID header
       ↓
User sees only their metrics (hard isolation)
```

## Components

### 1. Mimir (docker/mimir/)

- **Multitenancy**: `multitenancy_enabled: true`
- **Tenant ID**: `X-Scope-OrgID` HTTP header = `user_id`
- **Storage**: MinIO (S3-compatible)
- **Remote write**: `POST /api/v1/push` with tenant header (batched per tenant)
- **Limits**: Per-tenant ingestion rate, series cap, retention (365d)

### 2. Backend

- **metrics.service.js**: Validates, records in prom-client (cardinality tracking). User metrics go to Mimir only.
- **mimir.service.js**: Batch-pushes metrics via `prometheus-remote-write` with `X-Scope-OrgID` (one request per tenant per batch)
- **metrics.routes.js**: Calls `pushMetricsToMimir(validMetrics)` after processing each request
- **grafanaTenant.service.js**: Creates Grafana org + Mimir datasource per user

### 3. Grafana

- **Org 1 (admin)**: Provisioned datasources: Prometheus (infra), Mimir (tenant 1 for testing). See `docker/grafana/provisioning/datasources/datasources.yml`.
- **Org per user**: `vizme-{userId}` with Mimir datasource via `grafanaTenant.service`
- **Datasource**: Mimir with custom header `X-Scope-OrgID: {userId}`
- **Auth proxy**: `X-WEBAUTH-ORGS: {orgId}:Editor` assigns user to their org

## Environment Variables

| Variable                 | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `MIMIR_URL`              | Mimir API URL (default: `http://mimir:8080` in Docker) |
| `GRAFANA_ADMIN_USER`     | Grafana admin for tenant provisioning                  |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin password                                 |

## Flow

1. User logs in, gets embed URL with JWT
2. User requests `/grafana/d/metrics?embed_token=xxx`
3. Backend validates token, gets `userId`
4. `ensureGrafanaTenant(userId)`:
   - Creates org `vizme-{userId}` if missing
   - Creates Mimir datasource with `X-Scope-OrgID: {userId}`
5. Backend proxies to Grafana with `X-WEBAUTH-USER: vizme_user_{userId}` and `X-WEBAUTH-ORGS: {orgId}:Editor`
6. Grafana assigns user to their org; user sees only their metrics

## Security

- **Hard isolation**: Mimir enforces tenant at query time; no cross-tenant data access
- **No label override**: Tenant ID comes from header, not from user-controlled labels
- **Per-org datasource**: Each user's org has a datasource that only queries their tenant
- **Panel datasource binding**: Dashboard panels explicitly use `mimir-{userId}` datasource UID (not default)
- **X-Scope-OrgID in jsonData**: Header value in `jsonData.httpHeaderValue1` (not secureJsonData) for reliable delivery

## Troubleshooting: No Metrics in Grafana

If metrics are pushed to Mimir but not visible in Grafana:

1. **Mimir datasource URL**: Must be `{MIMIR_URL}/prometheus` (e.g. `http://mimir:8080/prometheus`). Grafana appends `/api/v1/query`; Mimir serves the Prometheus API under `/prometheus`.
2. **Existing datasources**: If created before this fix, delete the Mimir datasource in the user's org and reload the embed (backend will recreate it). Or reset Grafana: `docker compose down && docker volume rm docker_grafana_data && docker compose up -d`.
3. **Backend logs**: Check for `Mimir batch push failed` — push may be failing.
4. **Verify**: In Grafana Explore with Mimir datasource, run `user_metric_*` — should return that tenant's data.

## Troubleshooting: "Dashboard not found" / 404 / orgId=-1

**Root cause**: Auth proxy users created with `auto_assign_org` default to org 1. When the backend proxies with `X-WEBAUTH-ORGS: {orgId}:Admin` and `X-Grafana-Org-Id: {orgId}`, Grafana UI routes may still use the user's cached org (org 1 or orgId=-1), causing 404 for dashboards in the user's org.

**Workaround**: If the embed shows "Unable to load Grafana dashboard" or 404:

1. Open Grafana directly: `http://localhost:3001/grafana` (or your Grafana URL)
2. The backend proxy will create your user; you may need to access via the app first so the proxy sets the cookie
3. In Grafana, switch to your org (Organization → vizme-{userId}) from the profile menu
4. Return to the app and retry the Library → Metrics embed

**Proxy headers**: The backend sends `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` to match Grafana's `root_url` so dashboard routes resolve correctly.

## Troubleshooting: "Dashboard not found" After Volume Reset

After `docker volume rm docker_grafana_data`, Grafana starts with empty DB. Tenant setup may fail if the dashboard is not yet provisioned in org 1, causing "Dashboard not found" or "no found" for users.

**Production-grade solution (implemented):**

1. **Dashboard provisioning format**: `metrics-dashboard.json` uses Grafana's format `{"dashboard": {...}, "folderUid": "", "overwrite": true}` so it loads correctly on startup.
2. **Dashboard fallback**: Backend reads `metrics-dashboard.json` from disk (mounted at `/app/dashboards` in Docker) when Grafana API returns 404. Set `DASHBOARD_JSON_PATH` if using a custom path.
3. **Provisioning retries**: Increased to 10 retries × 3s (30s total) to wait for Grafana provisioning.
4. **Fail tenant setup on dashboard error**: If dashboard creation fails, tenant setup returns 503 and the user sees "Dashboard unavailable" instead of an empty dashboard.
5. **Readiness check**: `GET /health/grafana-ready` verifies the metrics dashboard exists in org 1. Use after volume reset to confirm Grafana is ready for embed traffic.

## Troubleshooting Cross-Tenant Visibility

If users see each other's metrics:

1. **Datasource header**: Ensure Mimir datasource has `jsonData.httpHeaderName1: 'X-Scope-OrgID'` and `secureJsonData.httpHeaderValue1: tenantId`
2. **Panel binding**: Each panel must use datasource UID `mimir-{userId}` (set in `ensureDashboardInOrg`)
3. **Prometheus vs Mimir**: `/metrics` exposes app metrics only. User metrics go to Mimir only (batch push from backend)
4. **Verify**: In Grafana Explore with Mimir datasource, run `user_metric_*` — should only return that tenant's data

- **X-Scope-OrgID**: Header name in jsonData, value in secureJsonData (Grafana stores and forwards it correctly)
- **Explicit panel datasource**: Dashboard panels are bound to the tenant's Mimir datasource UID; Prometheus (org 1) must never be used for user metrics
- **Auto-correction on login**: `ensureMimirDatasource` updates X-Scope-OrgID when an existing datasource has a stale header (e.g. after user ID change)
- **Proxy header**: Backend adds `X-Scope-OrgID: {userId}` to every Grafana request; Grafana may propagate it to datasource queries

## Fixing Cross-Tenant Visibility

If users see each other's metrics:

1. **Existing dashboards**: The backend overwrites dashboards on each tenant setup; panels are re-bound to the Mimir datasource
2. **Existing datasources**: Delete and recreate per-user orgs, or reset Grafana volume: `docker compose down && docker volume rm docker_grafana_data && docker compose up -d`
3. **Verify**: Check `/health/grafana` and ensure Mimir datasource has `X-Scope-OrgID` header (jsonData.httpHeaderName1 + secureJsonData.httpHeaderValue1)

## Grafana Provisioning (Production)

All Org 1 datasources are provisioned via `docker/grafana/provisioning/datasources/datasources.yml`. Dashboards are provisioned from `docker/grafana/dashboards/` using the Grafana file format: `{"dashboard": {...}, "folderUid": "", "overwrite": true}`. This ensures the metrics dashboard loads correctly on startup (including after volume reset).

No manual datasource creation is required. This ensures idempotent restarts—`docker compose down && up` works without "data source with the same uid already exists" errors.

If you previously had manual datasources or a corrupted state, reset once:

## User Isolation Verification

To verify one user cannot see another's metrics:

| Layer                | Isolation mechanism                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **Mimir**            | `X-Scope-OrgID: {userId}` on every push and query; Mimir enforces tenant boundary                 |
| **Grafana org**      | One org per user (`vizme-{userId}`); user cannot switch orgs via proxy                            |
| **Mimir datasource** | Per-org datasource with `X-Scope-OrgID: {userId}` in secureJsonData                               |
| **Dashboard panels** | All user-metric panels bound to `mimir-{userId}` datasource (rebound in `ensureDashboardInOrg`)   |
| **PromQL**           | `user_id=~"^${user_id}$"` filter; `var-user_id` set by backend proxy from JWT (not user-editable) |
| **Auth proxy**       | `X-WEBAUTH-USER: vizme_user_{userId}`; Grafana assigns user to their org only                     |

**Test**: Log in as user A, note metrics. Log in as user B in another browser/incognito. User B must see only their metrics (or empty if none pushed). User B cannot access user A's data.

```bash
cd docker
docker compose down
docker volume rm docker_grafana_data
docker compose up -d
```
