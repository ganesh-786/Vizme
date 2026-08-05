# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Vizme, please report it privately rather than opening
a public issue.

- **Email:** ganeshchaudhary4400@gmail.com
- **Include:** a description of the vulnerability, steps to reproduce, and the potential impact.
  A minimal proof-of-concept is appreciated but not required.

You should receive an acknowledgment within a few days. Please give us a reasonable amount of time
to investigate and address the issue before any public disclosure.

## Scope

This covers the code in this repository: the backend API, frontend SPA, the `visualizemet`
tracking library, the `vizme-python` client, and the Docker/deployment configuration in `docker/`.

Out of scope: vulnerabilities in third-party dependencies (report those upstream — though we
appreciate a heads-up so we can update), and issues that require physical or privileged access to
a deployment's infrastructure.

## Supported Versions

Vizme does not yet publish stable version tags; security fixes are applied to the `main` branch.
Deployments should track `main` (or the latest release once tagged releases begin) to receive
fixes.

## Security-Relevant Design Notes

For context when evaluating a report:

- Passwords are hashed with bcrypt (12 rounds); API keys are stored as SHA-256 hashes with only a
  short prefix retained for display.
- Access tokens are short-lived JWTs (15m default); refresh tokens are rotated and stored hashed.
- In production, the backend fails to start if `JWT_SECRET` is missing/weak or if
  `ALLOWED_METRICS_ORIGINS` is left as a wildcard — see `backend/src/config.js`.
- Multi-tenancy is enforced server-side via Grafana Mimir's `X-Scope-OrgID` header and per-user
  Grafana orgs — see `docs/architecture/MIMIR_MULTITENANCY.md`.
- Known gaps that are **not** security bugs to report (already tracked): password reset does not
  send an email yet, and rate limiting is per-instance rather than shared across replicas. See
  `docs/operations/PRODUCTION_ROADMAP.md`.
