# API Reference

Base URL: `API_BASE_URL` (e.g. `http://localhost:3000` in dev). All routes are mounted under
`/api/v1` except `/health/*`, `/metrics` (Prometheus scrape), and `/grafana/*` (embed proxy).

This reference is generated from the route source files, not hand-maintained prose — if it ever
disagrees with `backend/src/routes/*.js`, the code wins. Every response is JSON with a `success`
boolean; errors have `success: false` and an `error` string (plus `details` for validation errors
from `express-validator`).

## Authentication

Two independent auth schemes, used by different clients:

| Scheme                                    | Used by                             | How                                                                                                                                                                       |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT (`authenticate` middleware)           | Admin SPA                           | `Authorization: Bearer <accessToken>`, **or** an `httpOnly` cookie session (auto-refreshed transparently on safe `GET`/`HEAD`/`OPTIONS` requests using the refresh token) |
| API key (`authenticateApiKey` middleware) | Client-site tracking snippet / SDKs | `X-API-Key: <key>` header, or `?api_key=<key>` query param                                                                                                                |

Access tokens expire in 15m (`JWT_ACCESS_EXPIRY`), refresh tokens in 7d (`JWT_REFRESH_EXPIRY`).
Refresh tokens are rotated and stored hashed (SHA-256) in `refresh_tokens`.

## Auth — `/api/v1/auth`

| Method & Path                  | Auth                | Body                                       | Notes                                                                                                                           |
| ------------------------------ | ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `POST /signup`                 | none (rate-limited) | `email`, `password` (min 8 chars), `name?` | Creates user, sets auth cookies, returns `accessToken`. Warms the user's Grafana/Mimir tenant in the background.                |
| `POST /signin`                 | none (rate-limited) | `email`, `password`                        | Rotates refresh tokens, sets auth cookies, returns `accessToken`.                                                               |
| `POST /refresh`                | refresh cookie/body | `refreshToken?`                            | Rotates the refresh session, returns a new `accessToken`.                                                                       |
| `POST /session`                | JWT                 | `refreshToken?`                            | Syncs a client-held access token (and optionally refresh token) into cookies.                                                   |
| `POST /logout`                 | none                | —                                          | Revokes the refresh token and clears auth + Grafana embed cookies.                                                              |
| `POST /password-reset-request` | none (rate-limited) | `email`                                    | **Stub** — always returns a generic success message; no email is actually sent. See `docs/operations/PRODUCTION_ROADMAP.md` P0. |
| `GET /onboarding-status`       | JWT                 | —                                          | Whether the user has metric configs, an API key, and completed onboarding.                                                      |
| `POST /onboarding-complete`    | JWT                 | —                                          | Marks onboarding complete (idempotent).                                                                                         |

## API Keys — `/api/v1/api-keys`

All routes require JWT. Raw keys (`mk_<64 hex chars>`) are only ever returned once, at creation —
the DB stores a SHA-256 hash plus a 10-char prefix for display (`masked_key`).

| Method & Path   | Notes                                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`         | List the user's API keys (masked).                                                                                                                                                                                                 |
| `GET /user-key` | Return the user's single "account" key (the one with no `metric_config_id`/`site_id`), masked. `has_key: false` if none exists yet.                                                                                                |
| `POST /ensure`  | Idempotent: return the existing account key or create one. Raw key returned only when newly created (`is_new: true`). This is the key the code-generation snippet uses by default — one key covers all of a user's metric configs. |
| `POST /`        | Create a key scoped to a specific `site_id` (optional). Body: `key_name`, `site_id?`.                                                                                                                                              |
| `PATCH /:id`    | Update `key_name`, `is_active`, and/or `site_id`.                                                                                                                                                                                  |
| `DELETE /:id`   | Revoke/delete a key.                                                                                                                                                                                                               |

## Metric Configs — `/api/v1/metric-configs`

| Method & Path     | Auth                                 | Notes                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /by-api-key` | API key (`X-API-Key` or `?api_key=`) | Used by the tracking library/SDKs to fetch this user's metric definitions at runtime.                                                                                                                                                                                                             |
| `GET /`           | JWT                                  | List all metric configs for the user.                                                                                                                                                                                                                                                             |
| `GET /:id`        | JWT                                  | Fetch one.                                                                                                                                                                                                                                                                                        |
| `POST /`          | JWT                                  | Create. Body: `name`, `metric_type` (`counter`\|`gauge`\|`histogram`\|`summary`), `metric_name` (Prometheus-format: `^[a-zA-Z_:][a-zA-Z0-9_:]*$`), `description?`, `help_text?`, `labels?` (array of `{name, value}`), `status?` (`active`\|`paused`\|`draft`). `metric_name` is unique per user. |
| `PATCH /:id`      | JWT                                  | Partial update, same fields as create.                                                                                                                                                                                                                                                            |
| `DELETE /:id`     | JWT                                  | Delete.                                                                                                                                                                                                                                                                                           |

## Sites — `/api/v1/sites`

All routes require JWT. Sites let a user group API keys/widgets per property (e.g. multiple
websites under one account).

| Method & Path | Notes                  |
| ------------- | ---------------------- |
| `GET /`       | List the user's sites. |
| `POST /`      | Create. Body: `name`.  |
| `PATCH /:id`  | Rename. Body: `name`.  |
| `DELETE /:id` | Delete.                |

## Dashboard Widgets — `/api/v1/dashboard-widgets`

All routes require JWT. Widgets configure the custom stat cards on the Live Metrics dashboard
(`GET /api/v1/metrics/dashboard` renders them).

| Method & Path | Notes                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`       | List widgets, optionally filtered by `?site_id=`.                                                                                                                                                                                                                                                                                  |
| `GET /:id`    | Fetch one.                                                                                                                                                                                                                                                                                                                         |
| `POST /`      | Create. Body includes `metric_name`, `query_kind` (`increase_24h`\|`max_latest`\|`custom`), `title`, plus optional `subtitle`, `section`, `sort_order`, `format` (`currency`\|`number`\|`percent`\|`integer`), `currency_code`, `promql_custom` (for `query_kind: custom`), `include_in_multi_chart`, `featured_chart`, `site_id`. |
| `PATCH /:id`  | Partial update.                                                                                                                                                                                                                                                                                                                    |
| `DELETE /:id` | Delete.                                                                                                                                                                                                                                                                                                                            |

## Code Generation — `/api/v1/code-generation`

| Method & Path | Auth | Notes                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /`      | JWT  | Body: `api_key_id?` (defaults to the user's account key), `auto_track?`, `custom_events?`, `auto_interactions?` (all booleans, default `true`/`true`/`false`). Returns a ~150-byte snippet that loads `/api/v1/tracker.js` at runtime — the snippet always covers **all** of the user's metric configs, not just ones that existed at generation time. Marks onboarding complete as a side effect. |

## Tracker — `/api/v1/tracker.js`

| Method & Path                                | Auth                      | Notes                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/tracker.js?k=<apiKey>&a=&c=&i=` | API key (query param `k`) | Dynamically generates and serves the full tracking library JS for the key's user, with that user's metric configs baked in. `a`/`c`/`i` (`0`/`1`) toggle auto-track / custom events / auto-interactions. Cached by the browser for 1 hour (`Cache-Control`, `ETag`). |

## Metrics Ingestion — `/api/v1/metrics`

| Method & Path                                              | Auth    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /`                                                   | API key | Body: `{ "metrics": [{ "name", "type", "value", "labels?", "operation?" }, ...] }`, 1–100 items, max 256 KB. Validates each metric (counters must be non-negative), records it, and **synchronously** pushes the batch to Mimir via remote-write with `X-Scope-OrgID = <user_id>` before responding — so response latency reflects real ingestion latency. Returns per-item errors alongside a `processed`/`total` count and `mimirWriteDurationMs`. |
| `GET /`                                                    | JWT     | Informational only — points the caller at Grafana/Mimir URLs. Actual metrics are not returned here.                                                                                                                                                                                                                                                                                                                                                  |
| `GET /dashboard?site_id=&include_series=&include_details=` | JWT     | Runs the user's dashboard widgets as PromQL against Mimir (tenant-scoped) and returns stats/timeseries for the Live Metrics page.                                                                                                                                                                                                                                                                                                                    |

## Grafana — `/api/v1/grafana` and `/grafana/*`

| Method & Path                   | Auth                       | Notes                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/grafana/embed-url` | JWT (rate-limited)         | Returns a short-lived signed embed URL scoped to the caller's Grafana org/tenant, for use as the dashboard `<iframe>` `src`.                                                                                                                                                                                                              |
| `GET,POST,... /grafana/*`       | Embed session cookie/token | Reverse-proxies to Grafana, validating the embed token and forcing the `user_id` template variable to the authenticated user — see `docs/architecture/VISUALIZATION_AND_GRAFANA.md`. Must be served from the **same origin** as the app for the auth cookie to be sent (see `docs/operations/PRODUCTION.md#reverse-proxy-grafana-embed`). |

## Health — `/health`

Used for load balancer/orchestrator probes and for debugging the Mimir/Grafana pipeline; none of
these require auth.

| Method & Path                                      | Notes                                                                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`                                 | Liveness — process is running, no dependency checks.                                                                                                                       |
| `GET /health/ready` (and `GET /health/`)           | Readiness — checks the database is reachable. Use this for load balancer / Kubernetes readiness probes.                                                                    |
| `GET /health/grafana`                              | Checks the backend can reach Grafana with valid admin credentials.                                                                                                         |
| `GET /health/grafana-ready`                        | Checks the metrics dashboard is provisioned in org 1 and that its Mimir/Prometheus datasources are healthy.                                                                |
| `GET /health/metrics-pipeline?tenant_id=&active=1` | Read-only by default: queries Mimir directly and checks Grafana connectivity/datasources. With `?active=1`, also performs a real write-then-read-back probe against Mimir. |

## Prometheus scrape — `GET /metrics`

Unauthenticated by default (optionally protected by HTTP basic auth — see
`METRICS_SCRAPE_USER`/`METRICS_SCRAPE_PASSWORD` in `docs/operations/PRODUCTION.md`). Exposes the backend's
**own** app metrics (`http_requests_total`, Mimir remote-write duration/sample counts, etc.) in
Prometheus text format for Prometheus to scrape — this is not where end-user tracked metrics live;
those go to Mimir (see `docs/architecture/MIMIR_MULTITENANCY.md`).
