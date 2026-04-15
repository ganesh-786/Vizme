# Production Deployment Checklist

Use this checklist to run Vizme in a production-grade way.

## Environment variables

### Backend (required in production)

| Variable                                         | Description                                                                     | Production                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                       | Set to `production`                                                             | **Required**                                                                                                                                            |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`   | PostgreSQL connection                                                           | **Required**                                                                                                                                            |
| `JWT_SECRET`                                     | Signing key for JWTs; min 32 chars, cryptographically random                    | **Required**; never use default or example values                                                                                                       |
| `FRONTEND_URL`                                   | Origin of the admin frontend (for CORS and Grafana embed URL)                   | **Required** (e.g. `https://app.example.com`). Must match where users access the app so the Grafana iframe loads same-origin (cookie sent, avoids 401). |
| `API_BASE_URL`                                   | Public base URL of the API (for snippets and tracker)                           | **Required** (e.g. `https://api.example.com`)                                                                                                           |
| `DB_SSL`                                         | Set to `true` if DB requires TLS                                                | Recommended for managed DBs                                                                                                                             |
| `DB_SSL_REJECT_UNAUTHORIZED`                     | Set to `true` with valid DB CA in production                                    | **Required** when `DB_SSL=true`                                                                                                                         |
| `ALLOWED_METRICS_ORIGINS`                        | Comma-separated origins for metrics/tracker CORS; use specific domains, not `*` | Recommended                                                                                                                                             |
| `METRICS_SCRAPE_USER`, `METRICS_SCRAPE_PASSWORD` | Basic auth for Prometheus scraping `/metrics`; set both to enable               | Recommended                                                                                                                                             |
| `METRICS_RATE_LIMIT_MAX`                         | Requests per minute per API key (default 500)                                   | Optional                                                                                                                                                |
| `METRICS_MAX_LABELS`                             | Max label keys per metric (default 10)                                          | Optional                                                                                                                                                |
| `METRICS_MAX_LABEL_VALUE_LENGTH`                 | Max chars per label value (default 128)                                         | Optional                                                                                                                                                |
| `METRICS_MAX_SERIES_PER_USER`                    | Max unique series per user (default 1000)                                       | Optional                                                                                                                                                |
| `GF_SECURITY_ADMIN_PASSWORD`                     | Grafana admin password                                                          | **Required** in production                                                                                                                              |
| `LOG_LEVEL`                                      | `error`, `warn`, `info`, `debug`                                                | Optional (default `info`)                                                                                                                               |

### Frontend (build-time)

| Variable            | Description                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | Backend API URL (e.g. `https://api.example.com`). Omit if API is same origin. |

## Security

- [ ] **JWT_SECRET**: Generated with `openssl rand -base64 32` or equivalent; never commit.
- [ ] **Database**: Use a dedicated DB user with minimal privileges; enable SSL and `DB_SSL_REJECT_UNAUTHORIZED=true` for managed DBs.
- [ ] **CORS**: Set `ALLOWED_METRICS_ORIGINS` to the exact origins that will load the tracker (e.g. your app and customer domains). Avoid `*` in production.
- [ ] **Helmet**: CSP is enabled in production; ensure `FRONTEND_URL` and `GRAFANA_URL` (if embedding) are correct.
- [ ] **Grafana**: Set `GF_SECURITY_ADMIN_PASSWORD`; use LDAP/OAuth or auth proxy; disable anonymous access if not needed.
- [ ] **Metrics scrape**: Set `METRICS_SCRAPE_USER` and `METRICS_SCRAPE_PASSWORD` for basic auth on `/metrics`; Prometheus will use the same credentials in its scrape config.
- [ ] **Secrets**: No secrets in frontend; only `VITE_*` vars are exposed at build time.

## Observability

- [ ] **Health**: Use `/health/ready` for load balancer or Kubernetes readiness; `/health/live` for liveness.
- [ ] **Metrics**: Prometheus scrapes `/metrics`; app metrics (`http_requests_total`, `http_request_duration_seconds`) and user metrics are exposed.
- [ ] **Alerts**: Copy `docker/alertmanager/alertmanager-prod.example.yml` to `alertmanager.yml` and set your Slack webhook or email; Prometheus will use it via rule_files.
- [ ] **Logs**: Backend uses structured JSON logging (pino); send logs to your pipeline (e.g. Loki, CloudWatch) and correlate with `x-request-id`.

## Reliability

- [ ] **Database**: Use connection pooling (e.g. PgBouncer) and read replicas if needed.
- [ ] **Backend**: Run multiple instances behind a load balancer; ensure sticky sessions are not required (stateless JWT).
- [ ] **Prometheus**: Single backend scrape target today; if you scale backends, consider a metrics aggregator or remote write so one place exposes user metrics.

## Reverse proxy (Grafana embed)

For the Grafana embed to work without 401 errors, the embed iframe must load from the **same origin** as the parent app (so the auth cookie is sent). Configure your reverse proxy (nginx, Caddy, etc.) to:

- Proxy `/api` to the backend
- Proxy `/grafana` to the backend (same as `/api`)

Example nginx snippet:

```nginx
location /api { proxy_pass http://backend:3000; proxy_set_header Host $host; ... }
location /grafana { proxy_pass http://backend:3000; proxy_set_header Host $host; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; ... }
```

Set `FRONTEND_URL` to the public URL where users access the app (e.g. `https://app.example.com`). The embed URL will use this so the iframe loads same-origin.

## Docker Compose (production)

1. Copy `docker/.env.example` to `docker/.env` and set all variables; ensure `JWT_SECRET` is strong and unique.
2. Set `NODE_ENV=production` in `docker/.env` or in the `environment` section for the backend.
3. Do not use default Grafana credentials; set `GF_SECURITY_ADMIN_PASSWORD` and consider `GF_AUTH_*` for real auth.
4. Optionally restrict Alertmanager to internal network only and configure receivers.

## Quick checks

- Backend fails to start if `JWT_SECRET` is missing or weak in production.
- Health: `curl -s http://localhost:3000/health/ready` returns 200 when DB is up.
- Metrics: `curl -s http://localhost:3000/metrics` returns Prometheus text format.
- Frontend builds with `npm run build`; set `VITE_API_BASE_URL` for production API URL.
