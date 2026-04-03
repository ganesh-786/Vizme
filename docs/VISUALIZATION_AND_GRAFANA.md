# Visualization strategy: Recharts-first dashboards

## Canonical product path

Vizme serves **customer-facing metrics in the web app** using **React and [Recharts](https://recharts.org/)**. The browser calls `GET /api/v1/metrics/dashboard` with a normal **JWT**; the **backend** runs **PromQL** against **Grafana Mimir** with `X-Scope-OrgID` set to the authenticated user’s id. The UI never talks to Mimir or Prometheus directly.

That yields a **single, clear isolation boundary**: authentication identifies the tenant, and all queries run server-side with the correct tenant header.

## Why Grafana is not the primary visualization layer

The codebase may still provision **Grafana orgs** and datasources (for operators or optional “open in Grafana” flows), but **Grafana is intentionally not required** for the main dashboard experience. Reasons:

### 1. Proxying and multi-tenancy

Exposing Grafana to every tenant through your reverse proxy requires:

- Correct **org context** per user (or equivalent RBAC).
- **Auth mapping** from your app identity to Grafana (users, API keys, or auth proxy).
- Reliable **header forwarding** to Mimir (for example `X-Scope-OrgID`) so queries cannot cross tenants.

Misconfiguration can **expose another tenant’s data** or **hide data** in subtle ways. Debugging **subpath routing**, **WebSockets**, and **cookie** behavior on Grafana behind a proxy is significantly more work than running **bounded PromQL** in your own Node service, where you control one code path and one set of integration tests.

### 2. Embedding: sessions, cookies, and CSP

Embedded Grafana typically uses **iframes**, **sessions**, or **tokens**. Browser **third-party cookie** restrictions and strict **Content-Security-Policy** (`frame-ancestors`, `connect-src`) routinely break or complicate embeds. A first-party SPA chart shares the **same auth model** and cookie scope as the rest of Vizme.

### 3. Product velocity and vertical-specific dashboards

The product direction is **config-driven KPIs** (e-commerce, media, healthcare-style portals, etc.). Encoding that only in **Grafana dashboard JSON** multiplies maintenance: variables, panel copies per template, and versioning. A **small set of React chart components** driven by **API metadata** keeps **one definition** of “what we show” and avoids long-term **drift** between “the app” and “the Grafana copy.”

### 4. Where Grafana still helps

**Mimir remains the system of record** for time series. Grafana (including **Explore**) remains valuable for **internal debugging**, **SRE workflows**, and **ad-hoc PromQL** against a tenant-scoped datasource—without being the **default** experience for every end user.

Operational note: **do not treat Grafana dashboard JSON as the source of truth for product charts.** Product charts are defined by **dashboard widget configuration** (and legacy hardcoded KPIs where no widgets exist) plus the `/metrics/dashboard` contract.

## Related implementation

- Backend aggregation: `[backend/src/services/mimirQuery.service.js](../backend/src/services/mimirQuery.service.js)`
- React dashboard: `[frontend/src/components/MetricsDashboard/index.jsx](../frontend/src/components/MetricsDashboard/index.jsx)`
- Optional Grafana provisioning (ops path): `[backend/src/services/grafanaTenant.service.js](../backend/src/services/grafanaTenant.service.js)`
