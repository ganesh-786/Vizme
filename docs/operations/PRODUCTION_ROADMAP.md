# Production Roadmap

This replaces `docs/archive/Roadmap.md` as the maintained plan. `Roadmap.md` was written generically before
most of the current Mimir/Grafana multi-tenant work landed and is kept only as historical context.
Everything below is scoped to what's actually in this repo today (2026-08-05).

## 1. Where the project actually stands

**Already production-shaped, not just MVP-shaped:**

- Real hard multi-tenancy: per-user Grafana org + Mimir tenant (`X-Scope-OrgID`), not a shared
  dashboard with a filter (`backend/src/services/grafanaTenant.service.js`, `docs/architecture/MIMIR_MULTITENANCY.md`).
- `backend/src/config.js` fails fast in production on a missing/weak `JWT_SECRET` or a wildcard
  `ALLOWED_METRICS_ORIGINS` — someone already thought about this, don't undo it.
- CI already gates on: Prettier, backend unit + integration tests, a Docker-based backend test
  profile, `npm audit --audit-level=critical`, Docker image builds, and a Trivy CRITICAL scan
  (`.github/workflows/ci.yml`). Plus full Playwright E2E on every push/PR (`e2e.yml`).
- `docker-compose.prod.yml` already exists with memory/CPU limits, `restart: always`, and an nginx
  TLS-terminating reverse proxy. `docs/operations/PRODUCTION.md` is a genuinely usable prod checklist.
- Security headers (Helmet), rate limiting (auth/metrics/API/embed tiers), structured JSON logging
  (pino) with request-id correlation, health endpoints (`/health/live`, `/health/ready`) are done.

**This is not a "build the MVP" roadmap. It's a "close the gap between demo-ready and
customer-facing" roadmap.**

## 2. Gap analysis

Ordered by what would actually bite you first in production, not by category.

### P0 — will break or leak data under real usage

| Gap                                                                                                                            | Where                                                                                                                       | Why it matters                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password reset is a stub — no email is ever sent                                                                               | `backend/src/routes/auth.routes.js` (`POST /password-reset-request`, comment says "simplified - in production, send email") | Users who forget their password have no recovery path. Needs a transactional email provider (Resend, Postmark, or SES free tier) + a reset-token table/column and a `/reset-password` frontend page.                                                                                                                                                      |
| Rate limiting and Grafana embed sessions are in-process (express-rate-limit default store, JWT-in-cookie for embed)            | `backend/src/middleware/rateLimiter.js`, `backend/src/services/grafanaEmbedSession.service.js`                              | Fine for a single backend instance. The moment you run 2+ backend replicas behind a load balancer (which `docs/archive/Roadmap.md` and `docs/operations/PRODUCTION.md` both assume you'll eventually do), per-instance rate limits become meaningless (N× the real limit) and are easy to bypass. Needs a shared store (Redis) before horizontal scaling. |
| No automated Postgres backups documented or scripted                                                                           | —                                                                                                                           | A single managed Postgres with no backup/restore runbook is a data-loss incident waiting to happen. Neon/Render Postgres both have automatic backups on paid tiers — verify retention and **write down the restore procedure** before go-live, don't assume it.                                                                                           |
| `docs/architecture/ARCHITECTURE.md`'s "Metric Collection Flow" section is stale relative to the actual Mimir remote-write path | `docs/architecture/ARCHITECTURE.md` vs `backend/src/services/mimir.service.js`                                              | Low risk technically, but a new engineer (or you, in six months) reading it will build a wrong mental model of the ingestion pipeline. `docs/architecture/MIMIR_MULTITENANCY.md` is the accurate one.                                                                                                                                                     |

### P1 — needed before onboarding real (non-trial) customers

| Gap                                                                | Where                                                  | Why it matters                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No email verification on signup                                    | `backend/src/routes/auth.routes.js`                    | Anyone can sign up with any email; combined with the password-reset gap above, account recovery and abuse prevention are both weak. Same email-provider work covers both.                                                                                                         |
| No per-tenant resource quotas beyond `METRICS_MAX_SERIES_PER_USER` | `backend/src/config.js` (`rateLimit`, `METRICS_MAX_*`) | One user with a runaway tracking snippet (e.g. a bug that fires a counter per keystroke) can dominate rate limits and Mimir ingestion for everyone sharing the backend instance. There's a per-user series cap but no ingestion-rate cap surfaced per tenant in Grafana/alerting. |
| No billing/usage metering                                          | —                                                      | Not needed for a free/beta launch, but if the plan is ever "paid SaaS," usage tracking needs to exist from day one — retrofitting billing onto unmetered infra is much harder than building it in. Not urgent; flagging so it's a deliberate decision, not an oversight.          |
| No centralized log aggregation                                     | `backend/src/logger.js` (pino, stdout)                 | Logs are structured and request-id-correlated, which is the hard part — but they only exist as container stdout right now. Fine on a single host you can `docker logs`; painful the moment you have 2+ instances or need to search history.                                       |
| `pyLibrary/` has no test suite                                     | `pyLibrary/src/vizme/`, `pyLibrary/smoke_demo.py`      | The JS `library/` and backend both have real test coverage; the Python client only has a smoke script. Low priority unless you're actively marketing the Python SDK.                                                                                                              |

### P2 — do this once you have paying/real users, not before

- Redis-backed rate limiting + embed-session store (unblocks horizontal scaling — see P0 above,
  listed here too because it's the actual trigger for doing it).
- OpenTelemetry tracing across backend → Mimir/Grafana calls (currently: metrics and logs exist,
  traces don't).
- Read replica / connection pooling (PgBouncer) once a single Postgres instance is measurably the
  bottleneck — don't add this speculatively.
- Audit logging for account/API-key actions if you ever need SOC2/GDPR-style compliance.

Everything past this point (multi-region, Kafka ingestion, ML anomaly detection, service mesh) is
genuinely enterprise-scale work and premature for the current stage — `docs/archive/Roadmap.md`'s Phase 3+
content applies here if/when you have the user volume to justify it, not before.

## 3. Recommended deployment: Render + Neon, with one honest caveat

Render (web services) + Neon (Postgres) is a good fit for the **stateless** half of this system —
backend and frontend. It is a poor fit for the **stateful observability stack** (Mimir, Prometheus,
Grafana, Alertmanager, MinIO), because Render's free/starter web services have no persistent disk —
Mimir needs durable object storage for blocks, Prometheus needs a durable TSDB directory, and
Grafana needs a durable database for orgs/dashboards/users. Paid Render disks would work but stop
being "free."

**Recommended split:**

| Component                                            | Where                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend (Express API)                                | Render Web Service (free/starter), built from `backend/Dockerfile`                                                                                                                                                                    | Stateless, scales fine on Render, free tier is enough for a beta.                                                                                                                                                                                                                                                                          |
| Frontend (React SPA)                                 | Render Static Site or the existing `frontend/Dockerfile` + nginx on a Web Service                                                                                                                                                     | Static assets, no state at all.                                                                                                                                                                                                                                                                                                            |
| PostgreSQL (app DB: users, API keys, metric configs) | Neon free tier                                                                                                                                                                                                                        | Generous free tier, branching for staging, no disk to manage.                                                                                                                                                                                                                                                                              |
| Mimir + Prometheus + Grafana + Alertmanager + MinIO  | A single small **always-free VM** (Oracle Cloud "Always Free" ARM instance is the standout option: 4 OCPUs / 24GB RAM / persistent block storage, genuinely free forever, not a trial) running `docker/docker-compose.prod.yml` as-is | This stack needs persistent disk and benefits from running together on one host (it already does, in the existing compose file) — don't force it onto a platform that can't give it durable storage for free. A $4–6/mo VPS (Hetzner, DigitalOcean) is the fallback if Oracle's free-tier signup/availability is a problem in your region. |

This isn't a workaround — it's the same "stateless app tier vs. stateful data tier" split the repo's
own `docs/operations/PRODUCTION.md` already assumes (it talks about load balancers in front of multiple
backend instances and a separate DB). Render+Neon just becomes the app tier; the VM becomes the
data/observability tier the app tier talks to over HTTPS.

### Steps

1. **Provision Neon**: create a project, get the connection string, split it into
   `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` (config.js wants discrete vars, not a
   single `DATABASE_URL`), set `DB_SSL=true` and `DB_SSL_REJECT_UNAUTHORIZED=true`.
2. **Provision the VM** (Oracle Free Tier or equivalent): install Docker, copy `docker/`, set
   `docker/.env` per `docker/.env.example` (generate `JWT_SECRET` isn't needed here — that's the
   backend's, not the infra stack's — but do set `GF_SECURITY_ADMIN_PASSWORD`,
   `MINIO_ROOT_PASSWORD`), run `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
   for the Mimir/Grafana/Prometheus/Alertmanager/MinIO services only (the `backend`/`frontend`
   services in that compose file are optional here since Render hosts those instead — you can
   still run them for defense-in-depth or skip and rely on Render).
3. **Point the VM's nginx-proxy (or Caddy) at a real domain with TLS** — Let's Encrypt via
   `docker/nginx/nginx-proxy.conf` as a starting point, or swap to Caddy for automatic certs if you
   want less manual cert management than the current nginx+certbot setup implies.
4. **Deploy backend to Render**: connect the repo, set root directory to `backend/`, build with
   the existing `Dockerfile`, set every env var from `docs/operations/PRODUCTION.md`'s table — critically
   `MIMIR_URL`, `GRAFANA_URL`, `GRAFANA_ADMIN_USER/PASSWORD`, `GRAFANA_MIMIR_DATASOURCE_URL` all
   need to point at the VM's public HTTPS endpoints now, not `mimir:8080`/`grafana:3000`
   Docker-network hostnames.
5. **Deploy frontend to Render**: static site build (`npm run build` in `frontend/`), set
   `VITE_API_BASE_URL` to the Render backend's public URL at build time.
6. **Fix the Grafana-embed same-origin requirement** (`docs/operations/PRODUCTION.md#reverse-proxy-grafana-embed`):
   with backend on Render and Grafana on the VM, they're different origins unless you proxy
   `/grafana` through the same host the frontend/API are served from. Either add a `/grafana` route
   on Render's backend that reverse-proxies to the VM (the codebase already depends on
   `http-proxy`, which suggests this proxying pattern is anticipated — verify
   `backend/src/routes/grafana.routes.js` does this) or put both backend and Grafana behind the
   same custom domain via Render's own routing. Don't skip this — it's the difference between the
   embedded dashboard working and every user seeing a 401.
7. **Wire CI to deploy**: Render auto-deploys on push by default once connected; no new GitHub
   Actions workflow is strictly required, but if you want deploys gated on the existing CI jobs
   passing first, add a `deploy` job to `.github/workflows/ci.yml` that only runs after
   `backend-test`, `security`, and `docker-build` succeed, using Render's deploy hook URL as a
   secret.
8. **Backups**: schedule Neon's point-in-time recovery (check retention window on the free tier —
   it's shorter than paid), and add a cron on the VM to snapshot the MinIO bucket (Mimir's actual
   metric data) somewhere off-VM (e.g. a free-tier B2/S3 bucket) — losing the VM without a metrics
   backup means every customer's historical dashboards are gone.

## 4. Suggested execution order

1. Fix the P0 items (§2) — especially password reset/email, since that's user-facing and currently
   broken, not just "not yet built."
2. Do the deployment split in §3 so there's a real staging/production environment to validate
   against, rather than developing further against Docker Compose on a laptop indefinitely.
3. Add email verification (P1) — it's the same infrastructure (transactional email) as password
   reset, so bundle the work.
4. Only then take on P2 (Redis-backed rate limiting, tracing, etc.) — these are scaling concerns
   that are wasted effort before you have real concurrent load to scale for.

## 5. What NOT to build yet

Explicitly deferring, so it doesn't get built prematurely: Kubernetes, service mesh, multi-region,
Kafka/streaming ingestion, ML anomaly detection, a custom dashboard builder to replace
Grafana-as-primary-viz. All of these are in `docs/archive/Roadmap.md`'s later phases and are correct
_eventually_ — none of them are correct before the P0/P1 gaps above are closed and there's real
user traffic to justify the operational cost of running them.
