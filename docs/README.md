# Documentation Index

This folder holds the living documentation for Vizme, organized by category. If a doc ever
disagrees with the code, the code wins — please fix the doc when you notice drift.

```
docs/
├── getting-started/   Local setup
├── architecture/       System design, multi-tenancy, Grafana embed model
├── reference/           API, SDKs, metrics semantics
├── operations/          Deployment, testing, roadmap
└── archive/              Superseded docs kept for historical context only
```

## Getting started

- [getting-started/SETUP.md](./getting-started/SETUP.md) — Local setup, with and without Docker.

## Architecture & design

- [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) — System components, data flow,
  security model.
- [architecture/MIMIR_MULTITENANCY.md](./architecture/MIMIR_MULTITENANCY.md) — How per-user hard
  tenant isolation works (Mimir `X-Scope-OrgID` + Grafana orgs).
- [architecture/VISUALIZATION_AND_GRAFANA.md](./architecture/VISUALIZATION_AND_GRAFANA.md) —
  Grafana embed/proxy identity model.

## API & SDK reference

- [reference/API.md](./reference/API.md) — REST API reference (every route, auth scheme, and body
  shape).
- [reference/usingCodeSnippet.md](./reference/usingCodeSnippet.md) — Metrics workflow via the
  generated `tracker.js` snippet.
- [reference/usingLibrary.md](./reference/usingLibrary.md) — Metrics workflow via the
  `visualizemet` npm package.
- [reference/METRICS_CALCULATIONS.md](./reference/METRICS_CALCULATIONS.md) — How each dashboard
  metric is calculated (PromQL), including a worked Total Revenue example.
- [../library/README.md](../library/README.md) — `visualizemet` SDK reference, including zero-code
  HTML-attribute tracking (product context, `vizme:track`, Schema.org fallback).

## Operations

- [operations/PRODUCTION.md](./operations/PRODUCTION.md) — Production deployment checklist (env
  vars, security, reverse proxy, observability).
- [operations/PRODUCTION_ROADMAP.md](./operations/PRODUCTION_ROADMAP.md) — Current gap analysis
  and deployment plan; the maintained roadmap.
- [operations/BACKEND_TESTING.md](./operations/BACKEND_TESTING.md) — Running backend
  unit/integration tests locally and in Docker, and what CI runs.
- [../docker/docker_docs/TROUBLESHOOTING.md](../docker/docker_docs/TROUBLESHOOTING.md) and
  [FIX_DNS_ERROR.md](../docker/docker_docs/FIX_DNS_ERROR.md) — Docker Compose troubleshooting.

## Archive

- [archive/Roadmap.md](./archive/Roadmap.md) — An earlier, generic phased roadmap written before
  most of the current Mimir/Grafana multi-tenant work landed. Kept for context; **not
  maintained** — see `operations/PRODUCTION_ROADMAP.md` instead.
