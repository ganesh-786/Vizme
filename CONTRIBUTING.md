# Contributing to Vizme

## Getting set up

Follow [docs/getting-started/SETUP.md](./docs/getting-started/SETUP.md) to get the backend, frontend, and Docker infrastructure
(Postgres, Mimir, Prometheus, Grafana) running locally. Read
[docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md) and
[docs/architecture/MIMIR_MULTITENANCY.md](./docs/architecture/MIMIR_MULTITENANCY.md) first if you're touching the metrics
pipeline — the multi-tenant isolation model is the one thing in this codebase that's easy to break
silently.

## Before opening a PR

Run, from the repo root:

```bash
npm run format:check        # Prettier — must pass, CI enforces it
cd backend && npm run test:unit && npm run test:integration
cd ../frontend && npx playwright test --project=chromium   # requires backend + Postgres running
```

CI (`.github/workflows/ci.yml`, `e2e.yml`) additionally runs `npm audit --audit-level=critical`,
a Docker-based backend test profile, Docker image builds, and a Trivy CRITICAL vulnerability scan.
A PR that fails any of these won't merge — try to catch issues locally first.

## Conventions

- Backend: ESM, Node 20. Keep routes thin (`backend/src/routes/`) — business logic belongs in
  `backend/src/services/`.
- Formatting is Prettier-enforced (single quotes, semicolons, 100-char width) — run
  `npm run format` before committing rather than hand-formatting.
- Backend tests: Vitest. Unit tests (`*.test.js`) should mock external calls; integration tests
  (`*.int.test.js`) run against a real Postgres instance.
- Frontend tests: Playwright E2E only, against the real stack (no mocked auth). Use
  `getByRole`/`getByLabel`/`getByText` locators and web-first assertions; generate unique test data
  per run so tests stay independent.
- If you touch env vars, update `backend/src/config.js` (the source of truth), `docker/.env.example`,
  and `docs/operations/PRODUCTION.md`'s variable table together — they're expected to stay in sync.
- If you touch `docs/architecture/ARCHITECTURE.md` or any other doc, prefer fixing drift you notice over adding
  a new doc that duplicates it.

## Reporting bugs / requesting features

Open a GitHub issue with clear repro steps (for bugs) or the problem you're trying to solve (for
features). For security vulnerabilities, see [SECURITY.md](./SECURITY.md) instead — please don't
open a public issue for those.

## License

By contributing, you agree that your contributions will be licensed under the project's
[MIT License](./LICENSE).
