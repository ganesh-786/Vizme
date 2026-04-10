# Keycloak Architecture Critical Review

**Date:** 2026-04-09  
**Review Type:** Re-inspection after Grafana stability updates  
**Scope:** Keycloak auth flow, authorization enforcement, Grafana/Mimir tenant isolation, and documentation accuracy.

---

## 1) Executive Summary

Current state is meaningfully better than the previous pass, especially in Grafana integration stability and operational resilience.

- Authentication path is now clearly Keycloak-first in runtime middleware (no active dual-mode execution in request auth path).
- Grafana embedding and tenant bootstrap logic has been hardened (URL handling, org bootstrap fallback, retry/reprovision behavior, auth-proxy headers).
- Authorization remains partially inconsistent across route groups.
- Multi-tenancy remains **per-user isolation** (`tenant = user_id`) rather than a true shared-tenant domain model.

**Bottom line:** system is more stable for current product behavior, but architecture contracts (authz + tenancy semantics + cleanup of stale toggles/docs) still need tightening before broad long-lived E2E investment.

---

## 2) Updated Architecture Rating

### Authentication Architecture: **8/10**

**Why**
- Strong:
  - Frontend Keycloak bootstrap remains clean (`frontend/src/App.jsx`, `frontend/src/lib/keycloak.js`).
  - Backend auth middleware is now explicit Keycloak-only at runtime (`backend/src/middleware/auth.middleware.js` -> `authenticateKeycloak`).
  - JWT verification via JWKS + issuer/azp checks + local-user resolution is robust (`backend/src/middleware/keycloak.middleware.js`).
- Remaining weakness:
  - Config/docs still include migration-era flags (`AUTH_PROVIDER`) that no longer control runtime auth behavior.

### Authorization Architecture: **6.5/10**

**Why**
- Strong:
  - Client-role guard usage is clear and enforced on several sensitive groups (`api-keys`, `metric-configs`, `code-generation`).
  - Admin path is explicitly gated by `isPlatformAdmin`.
- Weak:
  - `sites`, `dashboard-widgets`, `metrics/dashboard`, and `grafana/embed-url` require authentication but not the `API_USER` client role.
  - No single policy matrix document enforced as code contract.

### Multi-Tenancy Readiness: **5/10**

**Why**
- Strong:
  - Mimir isolation is hard-wired with `X-Scope-OrgID`.
  - Grafana service creates org per user and datasource per tenant with health checks and self-healing retries (`ensureGrafanaTenant`, `reprovisionTenantDashboard`).
- Weak:
  - Tenant model is still identity-coupled (`user_id`), not a first-class tenant/workspace membership system.

### Grafana Operational Readiness: **8/10**

**Why**
- Strong:
  - Grafana version pin and known-bug mitigations are documented in compose.
  - Auth proxy and subpath are aligned across backend proxy + Grafana config.
  - Fallback logic for missing dashboard/data source is implemented and user-facing errors are clearer.
- Weak:
  - Two frontend embed components still exist (`GrafanaEmbed` and `GrafanaDashboardEmbed`), increasing long-term drift risk.

### Codebase Cleanliness: **6/10**

**Why**
- Strong:
  - Core auth + grafana paths are now more explicit.
- Weak:
  - Stale migration residue still present in env/config/docs and likely to confuse future contributors.

### Testing Readiness: **5/10**

**Why**
- Strong:
  - Good candidate surface for smoke tests and contract tests exists now.
- Weak:
  - No clear automated test harness configuration discovered for this area (no test scripts in package manifests found by inspection query).
  - Tenancy semantics still not finalized for future shared-tenant requirements.

### Overall Architecture Score: **6.5/10**

Improved and usable for current behavior, but still needs policy cleanup and tenancy-contract clarity.

---

## 3) Verified Improvements Since Last Review

1. **Grafana stability hardening is real and substantial**
   - Version pinning and compatibility notes in `docker/docker-compose.yml`.
   - Proxy and subpath behavior aligned (`GF_SERVER_SERVE_FROM_SUB_PATH=true` + backend path rewriting safeguards).
   - Health/reprovision workflow implemented in `backend/src/services/grafanaTenant.service.js`.

2. **Auth runtime is cleaner than migration-era docs suggest**
   - `authenticate` now maps directly to Keycloak middleware.
   - Role helpers and admin checks are consolidated in Keycloak middleware paths.

3. **Embed/session behavior improved**
   - Tokenized embed URL flow + cookie continuity + websocket handling are present and coherent in `backend/src/routes/grafana.routes.js`.

---

## 4) Current Risks and Gaps

1. **Authorization policy inconsistency (still active)**
   - `API_USER` is required in some route groups but not others.
   - This creates ambiguity about the intended minimum role for authenticated users.

2. **Tenancy model mismatch with "true multi-tenant" language**
   - Isolation is currently user-centric and strong for metrics/Grafana.
   - It is not yet an org/workspace membership architecture.

3. **Configuration/documentation drift**
   - `AUTH_PROVIDER` is still passed through runtime env, but request authentication path is already Keycloak-only.
   - This can mislead operators into believing mode-switch behavior still exists.

4. **Duplicate Grafana frontend integration paths**
   - Both `GrafanaEmbed` and `GrafanaDashboardEmbed` exist, each with separate behavior.
   - Future bug fixes may diverge unless one path is canonicalized.

---

## 5) Multi-Tenancy Critical Verdict

### Is multi-tenancy currently safe?
- **Yes for per-user metric isolation.**
- **No for broad enterprise shared-tenant claims.**

### Is it incomplete?
- **Yes** (no first-class tenant entity, membership, or tenant claim contract).

### Is it risky?
- **Yes**, if roadmap includes multiple users collaborating within one tenant/workspace.

### Should broad testing start now?
- **Targeted testing yes; broad E2E no.**

Recommended now:
- auth bootstrap + token propagation tests
- 401/403 route contract tests
- per-user isolation checks on metrics/Grafana paths

Defer until contracts stabilize:
- large full-stack multi-tenant E2E matrix

---

## 6) Cleanup and Documentation Alignment (High Value)

### High-priority cleanup
- Remove/retire stale auth-mode language around `AUTH_PROVIDER` where runtime no longer supports it.
- Decide and document one canonical frontend Grafana embed component.
- Prune migration leftovers only after confirming no rollback dependency.

### Documentation updates needed
- Align all auth docs to "Keycloak-only runtime auth middleware."
- Document explicit authorization baseline by route group.
- Document tenancy truthfully as "per-user isolated metrics tenancy" unless/until domain model evolves.

---

## 7) Recommended Next-Step Order

1. **Publish a route authorization matrix** (auth required vs `API_USER` vs admin).
2. **Normalize enforcement** across currently inconsistent protected routes.
3. **Decide tenancy roadmap** (keep per-user model or move to tenant/membership model).
4. **Consolidate Grafana embed path** to one frontend component contract.
5. **Then expand tests** from smoke/contract to broader E2E once contracts are stable.

---

## 8) Final Verdict

Post-update architecture is improved and operationally stronger, especially around Grafana reliability and auth-proxy integration.

The next risk-reduction move is no longer "fix everything first," but rather:

**stabilize authorization and tenancy contracts, clean stale migration signals, and then scale automated testing confidently.**

