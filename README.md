# Vizme

A metrics collection and visualization platform. Users configure custom metrics, generate tracking code for their websites, and visualize data through embedded Grafana dashboards with per-tenant isolation.

## Features

- **User Authentication** — Signup/login with JWT access tokens and httpOnly refresh cookies
- **Metric Configuration** — Define custom metrics (counter, gauge, histogram, summary)
- **API Key Management** — Generate and rotate API keys for client authentication
- **Code Generation** — Generate JavaScript tracking snippets for client websites
- **Metrics Ingestion** — REST API endpoint for collecting metrics via Prometheus remote-write
- **Grafana Mimir** — Multi-tenant metrics storage with hard isolation (X-Scope-OrgID per user)
- **Grafana Visualization** — Embedded dashboards provisioned per tenant on signup

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose
- PostgreSQL 15 (via Docker or external)

### Using Docker (Recommended)

```bash
# Start infrastructure (Postgres, Mimir, Grafana, Prometheus)
cd docker
cp .env.example .env          # Edit with your DB credentials and JWT_SECRET
docker compose --profile local-db up -d

# Setup and start backend
cd ../backend
npm install
npm run migrate               # Create database tables
npm run dev                   # Starts on :3000 with auto-reload

# Setup and start frontend
cd ../frontend
npm install
npm run dev                   # Starts on :5173 with API proxy to :3000
```

### Access Points

| Service    | URL                          | Credentials     |
|------------|------------------------------|-----------------|
| Frontend   | http://localhost:5173        | —               |
| Backend    | http://localhost:3000        | —               |
| Grafana    | http://localhost:3001        | admin / admin   |
| Prometheus | http://localhost:9090        | —               |
| Mimir      | http://localhost:9009        | —               |

### Manual Setup

See [docs/SETUP.md](./docs/SETUP.md) for detailed instructions.

## Project Structure

```
Vizme/
├── backend/                   # Express 5 API (ESM)
│   ├── src/
│   │   ├── routes/            # Auth, metrics, API-key routes
│   │   ├── middleware/        # Auth, rate-limiting, error handling
│   │   ├── services/          # Auth session, Grafana tenant provisioning
│   │   └── config.js          # Centralized env config with validation
│   ├── scripts/migrate.js     # Database migration runner
│   └── index.js               # Server entrypoint
├── frontend/                  # React 18 + Vite SPA
│   ├── src/
│   │   ├── pages/             # Signup, Login, Dashboard, etc.
│   │   ├── api/               # Axios client + auth/metrics API wrappers
│   │   ├── store/             # Zustand auth store
│   │   └── components/        # Shared UI components
│   ├── e2e/                   # Playwright E2E tests
│   │   └── signup.spec.ts     # Signup flow test suite
│   └── playwright.config.ts   # Playwright configuration
├── library/                   # visualizemet npm SDK (browser metrics client)
├── docker/                    # Docker Compose + Grafana/Mimir/Prometheus configs
├── docs/                      # Documentation
├── .github/
│   └── workflows/
│       └── e2e.yml            # CI: Playwright E2E on push/PR
└── .env.example               # Environment variable template
```

## Testing

### Overview

E2E tests use [Playwright](https://playwright.dev) and live in `frontend/e2e/`. Tests run against the real frontend + backend + PostgreSQL stack — no mocks for auth flows.

CI runs automatically on every push to `main` and on all pull requests via GitHub Actions (`.github/workflows/e2e.yml`).

### One-Time Setup

Install Playwright browser binaries (required after `npm install` or Playwright version upgrades):

```bash
cd frontend
npx playwright install            # All browsers (Chromium, Firefox, WebKit)
npx playwright install chromium   # Or just Chromium to save disk space
```

### Running Tests Locally

**1. Start the backend stack** (Postgres + backend must be running for API-dependent tests):

```bash
# Terminal 1: Postgres
cd docker && docker compose --profile local-db up postgres

# Terminal 2: Backend
cd backend && npm run dev
```

Confirm the backend is healthy:

```bash
curl -sf http://localhost:3000/health/ready && echo "OK"
```

**2. Run the tests** (Vite dev server starts automatically via `webServer` in `playwright.config.ts`):

```bash
cd frontend

npx playwright test --project=chromium    # Headless, Chromium only (fastest)
npx playwright test --headed              # Watch browsers open and interact
npx playwright test --ui                  # Interactive UI with time-travel debugging
npx playwright test --debug               # Step-by-step with Playwright Inspector
```

**3. View results:**

```bash
cd frontend
npx playwright show-report
```

### npm Scripts

| Script                       | Command                              |
|------------------------------|--------------------------------------|
| `npm run test:e2e`           | Run all E2E tests (all browsers)     |
| `npm run test:e2e:ui`        | Interactive UI mode                  |
| `npm run test:e2e:headed`    | Headed mode (browsers visible)       |
| `npm run test:e2e:report`    | Open the last HTML report            |

### CI (GitHub Actions)

The workflow at `.github/workflows/e2e.yml` runs on every push to `main` and all PRs:

1. Spins up a PostgreSQL 15 service container
2. Installs dependencies (`npm ci`) for backend and frontend
3. Runs database migrations
4. Starts the backend and waits for its health endpoint
5. Installs Chromium and runs Playwright tests
6. Uploads HTML report and test artifacts (traces, screenshots, videos) with 7-day retention

Test failures appear as inline annotations on pull requests via the `github` reporter.

### Writing New Tests

Add `.spec.ts` files to `frontend/e2e/`. Follow these conventions:

- Use user-facing locators (`getByRole`, `getByLabel`, `getByText`) — resilient to DOM changes
- Use web-first assertions (`toBeVisible()`, `toHaveURL()`) — auto-wait with retry
- Generate unique test data per test to ensure isolation (e.g., `crypto.randomBytes` for emails)
- Keep each test independent — no test should depend on another test's side effects

## Technology Stack

**Backend:** Node.js 20, Express 5 (ESM), PostgreSQL 15, bcrypt + JWT, Pino logging, prom-client

**Frontend:** React 18, Vite 5, React Router 6, Zustand, Axios

**Metrics Pipeline:** Grafana Mimir (multi-tenant), Prometheus, Grafana (embedded dashboards)

**Testing:** Playwright (E2E), GitHub Actions (CI)

**Infrastructure:** Docker Compose, MinIO (S3 for Mimir), Alertmanager

## User Flow

1. **Sign Up / Login** — Create account with email + password; JWT issued
2. **Configure Metrics** — Define what metrics to collect (counter, gauge, histogram, summary)
3. **Generate API Key** — Create authentication key for the tracking SDK
4. **Generate Code** — Get a JavaScript snippet using the `visualizemet` SDK
5. **Integrate** — Paste the snippet into your website
6. **Visualize** — View metrics in your auto-provisioned Grafana dashboard

## Development

### Backend

```bash
cd backend
npm install
npm run migrate   # Run database migrations
npm run dev       # Development server with --watch auto-reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev       # Vite dev server on :5173 (proxies /api to :3000)
```

### Library (visualizemet SDK)

```bash
cd library
npm install
npm run build     # Builds CJS + ESM bundles with esbuild
```

## Documentation

- [Setup Guide](./docs/SETUP.md) — Detailed setup instructions
- [API Documentation](./docs/README.md#api-documentation) — Complete API reference
- [Architecture](./docs/ARCHITECTURE.md) — System architecture and design
- [Docker Troubleshooting](./docker/docker_docs/TROUBLESHOOTING.md) — Common Docker issues

## Production Deployment

See [docs/README.md](./docs/README.md#deployment) for production deployment guidelines.

## License

ISC
