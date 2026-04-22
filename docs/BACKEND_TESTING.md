# Backend Testing Runbook

This runbook describes how to run backend tests in local Node and Docker environments, and what CI executes.

## Scope

- Backend unit tests (`vitest`, fast, mock-heavy)
- Backend integration tests (`vitest` + route-level harnesses)
- Coverage report generation
- Docker-native backend test execution path

## Prerequisites

- Node.js 20+
- npm
- Docker + Docker Compose (for containerized test flow)

## Test Commands (Local Node)

Run from `backend`:

```bash
npm run test:unit
```

- Runs all unit tests (`src/**/*.test.js`)
- Expected: all tests pass

```bash
npm run test:integration
```

- Runs integration tests (`src/**/*.int.test.js`)
- Expected: all integration tests pass
- If no integration tests exist, command exits successfully by design

```bash
npm run test:coverage
```

- Runs unit tests with coverage
- Generates report in `backend/coverage`
- Open `backend/coverage/index.html` for detailed report

## Docker-Native Test Path

The Docker test profile is defined in:

- `docker/docker-compose.test.yml`

It provides:

- `postgres_test` (isolated test database)
- `backend-test` runner service (`npm ci && npm run test:unit && npm run test:integration`)

Run from repo root:

```bash
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.test.yml \
  --profile test \
  up --abort-on-container-exit --exit-code-from backend-test backend-test
```

Tear down after run:

```bash
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.test.yml \
  --profile test \
  down --volumes --remove-orphans
```

## CI Behavior

CI workflow file:

- `.github/workflows/ci.yml`

Backend-related jobs:

- `backend-test`:
  - `npm ci`
  - `npm run test:unit`
  - `npm run test:integration`
- `backend-test-docker`:
  - Runs the Docker profile command above
  - Uses `--exit-code-from backend-test` for deterministic job status
  - Always performs compose teardown

## Troubleshooting

- `test:integration` returns "No test files found":
  - This is valid only when no `*.int.test.js` files exist.
- DB-related failures in Docker test job:
  - Ensure `postgres_test` health check is green.
  - Confirm `DB_HOST=postgres_test` is used by `backend-test`.
- Mocks leaking between tests:
  - Ensure each integration file calls `vi.resetModules()` in setup and restores mocks in `beforeEach`.
- Coverage seems too low:
  - Expected at baseline; increase via additional service/route tests.

## Recommended Developer Workflow

For every backend test change:

1. `npm run test:unit`
2. `npm run test:integration`
3. `npm run test:coverage` (when expanding coverage)
4. Optional pre-PR parity: run Docker-native test profile command

