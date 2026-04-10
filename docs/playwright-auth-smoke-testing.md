# Playwright Auth Smoke Testing (Initial Layer)

## What was added

This project now has a small Playwright layer focused on auth and route-protection smoke coverage for the current Keycloak-first architecture.

Added files:

- `frontend/playwright.config.js`
- `frontend/tests/e2e/auth-smoke.spec.js`
- `frontend/tests/e2e/authenticated-access.spec.js`
- `frontend/tests/e2e/helpers/keycloak.js`

Updated files:

- `frontend/package.json` (Playwright scripts)
- `frontend/.gitignore` (Playwright output folders)

## Testing strategy used

The current suite is intentionally small and behavior-focused:

1. **Deterministic unauthenticated smoke tests**
   - Validate route guards without depending on live IdP behavior.
   - In these tests, Keycloak network requests are blocked so checks remain stable.

2. **Optional real Keycloak login smoke test**
   - Runs only when test credentials are provided.
   - Validates one realistic login path and protected route access.
   - If credentials are not set, this test is skipped (not failed).

This gives practical confidence without locking tests to unstable implementation details.

## What is currently tested

### Covered now

- Unauthenticated user is redirected from a protected route (example: `/sites`) to `/login`.
- Login route renders expected redirect state for unauthenticated users.
- Optional: authenticated user can log in through Keycloak, reach dashboard, and access a protected page (`/sites`).

### Why these tests were chosen

- They validate the most stable frontend auth contracts:
  - `PrivateRoute` protection
  - `GuestRoute` behavior
  - Core Keycloak login handoff (when env supports it)

## What is intentionally not tested yet

The following are deferred on purpose to avoid brittle tests and rework:

- Full multi-tenant E2E matrix (shared-tenant semantics are not finalized).
- Deep Grafana embed/iframe behavior across fallback modes.
- Broad role/permission permutations across all backend route groups.
- CRUD-heavy flows tightly coupled to evolving API contracts.

These areas are actively evolving and should be tested more deeply after authorization and tenancy contracts stabilize.

## How to run

From `frontend/`:

1. Install dependencies:
   - `npm install`
2. Install Playwright browsers (first time only):
   - `npx playwright install`
3. Run tests:
   - `npm run test:e2e`
4. Run in headed mode:
   - `npm run test:e2e:headed`
5. Open report:
   - `npm run test:e2e:report`

### Optional real Keycloak login test

Set credentials to enable the authenticated smoke case:

- `E2E_KEYCLOAK_USERNAME`
- `E2E_KEYCLOAK_PASSWORD`

If these are not set, real-login smoke is skipped.

## Recommended next steps (later)

After tenancy and authorization policy contracts are finalized:

- Add 401/403 contract-focused E2E checks for key protected route groups.
- Add stable tenant isolation scenarios based on the final tenant model.
- Add one canonical Grafana workflow test (once embed path is consolidated).
- Expand to key business CRUD flows only after API/UI contracts are stable.
