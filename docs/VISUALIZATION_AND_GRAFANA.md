# Visualization strategy: Grafana embed + API summary

## Vizme → Grafana identity (SSO-style)

There is **no separate Grafana password** for dashboard users: Grafana **`auth.proxy`** trusts headers injected only by the Vizme `/grafana` reverse proxy. The embed JWT carries the Vizme `user_id` and a **stable login** derived from the user’s **email** (`X-WEBAUTH-USER`, plus `X-WEBAUTH-EMAIL` / `X-WEBAUTH-NAME` when present). Operators still use Grafana’s admin account for bootstrap; end users should always open Grafana via **Open Grafana** or the embed (short-lived `embed_token` + optional httpOnly cookie on `/grafana`).

If **`FRONTEND_URL` and `API_BASE_URL` use different origins**, embed URLs default to **`API_BASE_URL`** so `/grafana` hits the backend without extra SPA routing. Override with **`GRAFANA_EMBED_PUBLIC_BASE_URL`** when your public API host differs from `API_BASE_URL`.

## Canonical product path

**Time-series and panel visualization** in the Live Metrics UI uses an **embedded Grafana** dashboard (`uid: metrics`) in an **iframe**. The browser loads a **first-party** URL with a short-lived **embed JWT** (`GET /api/v1/grafana/embed-url`). The **Vizme proxy** at `/grafana/*` validates that token, switches the user into their **Grafana org**, and forwards requests so **Mimir** queries use **`X-Scope-OrgID`** server-side (matching the authenticated user). The browser never sends that header to Mimir directly.

**At-a-glance KPI cards** (commerce vs ticketing summaries, widget-driven stats, errors, engagement) still come from **`GET /api/v1/metrics/dashboard`**, which runs **PromQL** in Node with the same tenant header—useful for fast, structured summaries without loading the iframe.

That yields a **single isolation model**: JWT identifies the tenant; **both** the dashboard API and the Grafana proxy enforce tenant scope.

## Operational notes

- **CSP / `frame-ancestors`**: The proxy strips conflicting frame headers and sets **`frame-ancestors`** so only the Vizme frontend origin may embed Grafana.
- **Token rotation**: The frontend refreshes the embed URL before JWT expiry (see `getEmbedUrl` + `GrafanaDashboardEmbed`).
- **Grafana dashboard JSON** (`docker/grafana/dashboards/metrics-dashboard.json`) defines panels bound to the per-tenant **Mimir** datasource; keep product-critical panels versioned there.

## Related implementation

- Backend aggregation: `[backend/src/services/mimirQuery.service.js](../backend/src/services/mimirQuery.service.js)`
- React dashboard (KPI cards + Grafana iframe): `[frontend/src/components/MetricsDashboard/index.jsx](../frontend/src/components/MetricsDashboard/index.jsx)`
- Grafana embed: `[frontend/src/components/GrafanaDashboardEmbed/GrafanaDashboardEmbed.jsx](../frontend/src/components/GrafanaDashboardEmbed/GrafanaDashboardEmbed.jsx)`
- Embed URL + proxy (X-Scope-OrgID): `[backend/src/routes/grafana.routes.js](../backend/src/routes/grafana.routes.js)`
- Grafana org + Mimir datasource provisioning: `[backend/src/services/grafanaTenant.service.js](../backend/src/services/grafanaTenant.service.js)`
