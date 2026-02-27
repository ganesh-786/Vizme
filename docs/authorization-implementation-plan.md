# Authorization Implementation Plan

**Date**: 2026-02-25  
**Status**: Phase 2 — Planning (awaiting approval before implementation)  
**Prerequisite**: [Authorization Architecture Overview](authorization-architecture-overview.md) (approved)

---

## Table of Contents

1. [Current State Summary](#1-current-state-summary)
2. [Exact Keycloak Configuration Steps](#2-exact-keycloak-configuration-steps)
3. [Backend Code Areas to Change](#3-backend-code-areas-to-change)
4. [Authorization Middleware Design](#4-authorization-middleware-design)
5. [Role Mapping Strategy](#5-role-mapping-strategy)
6. [Token Validation Logic](#6-token-validation-logic)
7. [Route Protection Matrix](#7-route-protection-matrix)
8. [Testing Plan](#8-testing-plan)
9. [Implementation Order Checklist](#9-implementation-order-checklist)

---

## 1. Current State Summary

### What Already Exists

| Component | Location | Notes |
|-----------|----------|--------|
| Keycloak JWT validation | `backend/src/middleware/keycloak.middleware.js` | `verifyKeycloakToken`, JWKS, issuer/azp checks |
| Auth middleware | `backend/src/middleware/auth.middleware.js` | `authenticate` = `authenticateKeycloak`; `authenticateApiKey` unchanged |
| User resolution | `keycloak.middleware.js` | `resolveLocalUser` → `req.user` (id, email, name), `req.keycloakPayload` |
| Realm role helper | `keycloak.middleware.js` | `getKeycloakRoles(payload)`, `requireRole(...roles)` — **not yet used on any route** |
| Protected routes | api-keys, metric-configs, code-generation, GET /api/v1/metrics | All use `authenticate` only; no role checks |
| Keycloak env | Backend | `KEYCLOAK_URL`, `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_FRONTEND_CLIENT_ID` |

### Keycloak Names in Use

- **Realm**: `unified-visibility` (from `KEYCLOAK_REALM`)
- **Backend client**: `uv-backend` (from `KEYCLOAK_CLIENT_ID`)
- **Frontend client**: `uv-frontend` (from `KEYCLOAK_FRONTEND_CLIENT_ID`)

### Gaps to Address

1. **Keycloak**: No realm or client roles defined yet; no protocol mappers for custom claims (e.g. tenant) if needed later.
2. **Backend**: No `ForbiddenError` (403); role checks use `UnauthorizedError` (401) — we will use 403 for “authenticated but not allowed”.
3. **Backend**: Only realm roles are read; client roles for `uv-backend` are not read or used.
4. **Routes**: No distinction between “any authenticated user” and “admin-only” or “elevated” routes; no route uses `requireRole`.
5. **Documentation**: No single place documenting which route requires which role.

---

## 2. Exact Keycloak Configuration Steps

All steps are to be performed in the Keycloak Admin Console (or via Admin REST API / Terraform if you automate later). Realm: **unified-visibility**.

### 2.1 Realm Roles (Realm → Realm roles)

1. Go to **Realm** → **Realm roles**.
2. Create the following roles (no description required for MVP; add later if desired):

   | Role name | Purpose |
   |-----------|---------|
   | `PLATFORM_ADMIN` | Full platform access; future admin-only API routes |
   | `default` | Keep as-is (Keycloak default); assign to all authenticated users |

3. Optionally create:
   - `SUPPORT_ENGINEER` — for read-only or diagnostic access if needed later.

### 2.2 Client Roles (for client `uv-backend`)

1. Go to **Clients** → select **uv-backend** (or create it if it does not exist).
2. Open the **Roles** tab for this client.
3. Create **Client roles** (not composite for MVP):

   | Role name | Purpose |
   |-----------|---------|
   | `API_USER` | Base role for any user allowed to call the backend API (recommended: assign to all frontend users who use the app) |
   | `API_ADMIN` | Backend admin operations (e.g. future admin-only routes) |

4. If you need tenant-scoped roles later, you can add:
   - `TENANT_ADMIN`, `TENANT_USER`, `TENANT_VIEWER` (per the architecture doc).

### 2.3 Assign Roles to Users / Groups

1. **Realm roles**
   - For a test platform admin user: **Users** → select user → **Role mapping** → **Assign role** → choose `PLATFORM_ADMIN` (and keep `default`).
   - For normal users: ensure they have at least `default` (Keycloak usually assigns this automatically for realm).

2. **Client roles (uv-backend)**
   - **Option A (recommended for MVP)**: Assign `API_USER` to all users who should use the app (e.g. via a **Group** that has the client role, or manually per user).
   - **Option B**: Assign `API_USER` by default via a **Client scope** or default client roles so that any user logging in through the frontend gets it.
   - For an admin test user: also assign `API_ADMIN` (and optionally `PLATFORM_ADMIN`).

3. **Frontend client (uv-frontend)**
   - Ensure the frontend is configured to request the correct scope/audience so that the access token received by the backend (if frontend sends it) contains `resource_access.uv-backend.roles` when the backend validates. Typically the frontend requests a token with audience or scope that includes the backend; then Keycloak can be configured to include client roles in the token (see 2.4).

### 2.4 Token Mappers (so backend sees roles in JWT)

1. **Realm roles**  
   Keycloak by default includes `realm_access.roles` in the access token. Verify in **Client scopes** → **dedicated scope for the client** (or default) that the mapper **realm roles** is present. No change needed if tokens already contain `realm_access.roles`.

2. **Client roles for uv-backend**  
   Ensure the access token includes roles for the **uv-backend** client:
   - Go to **Clients** → **uv-backend** → **Client scopes** → **uv-backend-dedicated** (or the scope attached to this client).
   - Add a **Mapper** (or use the default “client roles” mapper): type **User Client Role**; **Client ID** = `uv-backend`; **Token Claim Name** = leave default so it appears under `resource_access['uv-backend'].roles`.
   - Alternatively, if the frontend uses client `uv-frontend` and you want the backend to accept that token and still see backend roles: the user must have roles on **uv-backend** and the token must include them. That usually means the frontend requests a token that includes audience or scope for the backend, and Keycloak is configured to add `resource_access.uv-backend` when the user has roles on uv-backend. Confirm in Keycloak docs for “audience” and “client roles in token” for your flow.

3. **Optional: custom claim (e.g. tenant_id)**  
   If you introduce multi-tenancy later, add a **User Attribute** mapper or **Group** mapper to add e.g. `tenant_id` or `tenants` to the token. Not required for Phase 2.

### 2.5 Summary Checklist (Keycloak)

- [ ] Realm roles created: `PLATFORM_ADMIN` (and optionally `SUPPORT_ENGINEER`).
- [ ] Client `uv-backend` exists; client roles created: `API_USER`, `API_ADMIN`.
- [ ] At least one test user has `PLATFORM_ADMIN` + `API_ADMIN`; at least one test user has only `default` + `API_USER`.
- [ ] Access token contains `realm_access.roles` and `resource_access['uv-backend'].roles` (verify by decoding a JWT at jwt.io or via Keycloak token endpoint).

---

## 3. Backend Code Areas to Change

### 3.1 Error Handling

| File | Change |
|------|--------|
| `backend/src/middleware/errorHandler.js` | Add `ForbiddenError` class (status 403). In `errorHandler`, add a branch for `ForbiddenError` (or `err.name === 'ForbiddenError'`) and return `403` with a clear message (e.g. “Insufficient permissions”). |

**Reason**: Authorization failures (valid token but insufficient role) must return **403 Forbidden**, not 401.

### 3.2 Keycloak Middleware (Authorization Helpers)

| File | Change |
|------|--------|
| `backend/src/middleware/keycloak.middleware.js` | (1) Add `getKeycloakClientRoles(payload, clientId)` returning `resource_access[clientId].roles` or `[]`. (2) Change `requireRole` to use **403 ForbiddenError** instead of UnauthorizedError when the user is authenticated but lacks the role. (3) Add `requireClientRole(clientId, ...roles)` that checks client roles and uses ForbiddenError. (4) Optionally add helpers such as `hasRealmRole(payload, role)`, `hasClientRole(payload, clientId, role)`, `isPlatformAdmin(payload)` for use in handlers. |

**Reason**: Support both realm and client roles; consistent 403 for authorization failures.

### 3.3 Auth Middleware Re-export

| File | Change |
|------|--------|
| `backend/src/middleware/auth.middleware.js` | Re-export any new authorization helpers from keycloak.middleware (e.g. `requireClientRole`, `requireRole`, `isPlatformAdmin`) so routes can import from one place. Alternatively, routes can import directly from keycloak.middleware. |

### 3.4 Route Files (Apply Guards)

| File | Change |
|------|--------|
| `backend/index.js` | No change to route mounting order. Optionally add a comment that `/api/v1/admin/*` (if added later) must be protected by admin role. |
| `backend/src/routes/auth.routes.js` | No auth/role change (password-reset stub stays public with authLimiter). |
| `backend/src/routes/apikey.routes.js` | Keep `router.use(authenticate)`. Optionally add `requireClientRole(KEYCLOAK_CLIENT_ID, 'API_USER')` (or rely on “authenticated” only for MVP). |
| `backend/src/routes/metricconfig.routes.js` | Same as apikey: authenticate + optional API_USER. |
| `backend/src/routes/codeGeneration.routes.js` | Same. |
| `backend/src/routes/metrics.routes.js` | POST `/` stays with `authenticateApiKey` only. GET route already uses `authenticate`; optional API_USER. |
| **Future** | When you add admin-only routes (e.g. under `/api/v1/admin`), protect them with `authenticate` + `requireRealmRole('PLATFORM_ADMIN')` or `requireClientRole(KEYCLOAK_CLIENT_ID, 'API_ADMIN')`. |

**Reason**: Minimal change for MVP — keep existing behavior “any authenticated user” and optionally enforce `API_USER`. Introduce explicit admin routes and guards when those routes exist.

### 3.5 Configuration

| File | Change |
|------|--------|
| `backend/.env` / `docker-compose` | No new variables required for MVP. Same Keycloak vars. If you later add tenant or scope checks, you might add e.g. `KEYCLOAK_BACKEND_CLIENT_ID` (already effectively `KEYCLOAK_CLIENT_ID`). |

---

## 4. Authorization Middleware Design

### 4.1 Layering

1. **Authentication (existing)**  
   `authenticate` = `authenticateKeycloak`: validates JWT, sets `req.user`, `req.keycloakPayload`. Must run first on protected routes.

2. **Authorization (guards)**  
   Run after `authenticate`. Two styles:
   - **Route-level**: `requireRole('PLATFORM_ADMIN')` or `requireClientRole(clientId, 'API_USER', 'API_ADMIN')` as middleware.
   - **Handler-level**: Inside a route handler, call `if (!hasRealmRole(req.keycloakPayload, 'PLATFORM_ADMIN')) throw new ForbiddenError('...')` or use a small helper that returns 403.

### 4.2 Proposed Middleware / Helpers

- **requireRole(...realmRoles)**  
  - Already exists. Change to throw **ForbiddenError** when `req.keycloakPayload` exists but role is missing. Use when you want to restrict by **realm** role (e.g. `PLATFORM_ADMIN`).

- **requireClientRole(clientId, ...clientRoles)**  
  - New. Read `resource_access[clientId].roles`; if user has none of `clientRoles`, call `next(ForbiddenError(...))`. Use for API-level roles (e.g. `API_USER`, `API_ADMIN`).  
  - `clientId` should be the same as `KEYCLOAK_CLIENT_ID` (e.g. `uv-backend`). Can be read from env inside the middleware so routes do not pass it.

- **requireAnyRole(realmRoles, clientRoles)**  
  - Optional. Allow access if user has any of the given realm roles OR any of the given client roles (for uv-backend). Reduces duplication when a route accepts either realm or client admins.

- **Helpers (no middleware)**  
  - `getKeycloakRoles(payload)` — existing.  
  - `getKeycloakClientRoles(payload, clientId)` — new.  
  - `hasRealmRole(payload, role)`, `hasClientRole(payload, clientId, role)` — new, for use in handlers.  
  - `isPlatformAdmin(payload)` — true if `hasRealmRole(payload, 'PLATFORM_ADMIN')` or `hasClientRole(payload, clientId, 'API_ADMIN')` (optional).

### 4.3 Usage Pattern (Example)

```javascript
// Route: only authenticated users with API_USER (client role)
router.get('/something', authenticate, requireClientRole(KEYCLOAK_CLIENT_ID, 'API_USER'), handler);

// Route: admin only (realm role)
router.get('/admin/settings', authenticate, requireRole('PLATFORM_ADMIN'), handler);

// Handler-level check
if (!hasRealmRole(req.keycloakPayload, 'PLATFORM_ADMIN')) {
  return next(new ForbiddenError('Admin access required'));
}
```

### 4.4 401 vs 403

- **401 Unauthorized**: No token, invalid token, or expired token. Use existing `UnauthorizedError`.
- **403 Forbidden**: Valid token but insufficient permissions. Use new `ForbiddenError` and ensure error handler returns 403.

---

## 5. Role Mapping Strategy

### 5.1 Who Gets Which Roles

| User type | Realm roles | Client roles (uv-backend) |
|-----------|-------------|----------------------------|
| Platform admin | `default`, `PLATFORM_ADMIN` | `API_USER`, `API_ADMIN` |
| Normal app user | `default` | `API_USER` |
| Future tenant admin | `default` | `API_USER`, `TENANT_ADMIN` (when added) |
| Future viewer | `default` | `API_USER`, `TENANT_VIEWER` (when added) |

### 5.2 Where Roles Are Stored

- **Keycloak**: Single source of truth. Roles are assigned in Keycloak (user or group).
- **Backend**: No duplicate role store. Backend only **reads** roles from the JWT (`realm_access.roles`, `resource_access['uv-backend'].roles`). Local `users` table remains for `id`, `email`, `name`, `keycloak_id` and for foreign keys (api_keys, metric_configs, etc.).

### 5.3 Token Shape (Reference)

After Keycloak configuration, access token payload should look like:

```json
{
  "sub": "<keycloak-user-uuid>",
  "email": "user@example.com",
  "realm_access": { "roles": ["default", "PLATFORM_ADMIN"] },
  "resource_access": {
    "uv-backend": { "roles": ["API_USER", "API_ADMIN"] }
  },
  "azp": "uv-frontend",
  "iss": "http://localhost:8080/realms/unified-visibility",
  "exp": ...,
  "iat": ...
}
```

Backend will use `realm_access.roles` and `resource_access['uv-backend'].roles` (with client id from env).

---

## 6. Token Validation Logic

### 6.1 Current Validation (Keep As-Is)

- JWKS-based signature verification.
- Issuer: `KEYCLOAK_ISSUER_URL/realms/KEYCLOAK_REALM`.
- `azp` accepted as `KEYCLOAK_CLIENT_ID` or `KEYCLOAK_FRONTEND_CLIENT_ID` (tokens from frontend are often issued to uv-frontend; backend still accepts them).

No change required for Phase 2.

### 6.2 Optional Stricter Audience (Later)

If you want to enforce that only tokens intended for the backend are accepted, set Keycloak to put `aud: uv-backend` in the token and in `jose.jwtVerify` set `audience: KEYCLOAK_CLIENT_ID`. Current design accepts both frontend and backend clients for flexibility.

### 6.3 No Online Calls for Authorization (MVP)

Authorization is based only on token claims. No call to Keycloak’s entitlement or UserInfo endpoint in the hot path. Keeps latency low and avoids Keycloak as a single point of failure for each request.

---

## 7. Route Protection Matrix

| Route / group | Auth | Authorization (MVP) | Notes |
|---------------|------|----------------------|--------|
| `POST /api/v1/auth/password-reset-request` | None (authLimiter) | — | Stub |
| `GET/POST/PATCH/DELETE /api/v1/api-keys/*` | Bearer (authenticate) | Optional: requireClientRole('API_USER') | Already scoped by req.user.id |
| `GET /api/v1/metric-configs/by-api-key` | API key | — | No user JWT |
| All other `/api/v1/metric-configs/*` | Bearer (authenticate) | Optional: requireClientRole('API_USER') | Already scoped by req.user.id |
| `POST /api/v1/code-generation` | Bearer (authenticate) | Optional: requireClientRole('API_USER') | |
| `POST /api/v1/metrics` | API key (authenticateApiKey) | — | Ingestion |
| `GET /api/v1/metrics` | Bearer (authenticate) | Optional: requireClientRole('API_USER') | |
| `GET /api/v1/tracker.js`, etc. | API key / public as today | — | No change |
| `GET /health`, `GET /metrics` | None | — | No change |
| **Future** `/api/v1/admin/*` | Bearer (authenticate) | requireRole('PLATFORM_ADMIN') or requireClientRole('API_ADMIN') | To be added when admin features exist |

**MVP recommendation**: Keep current behavior (authenticate only) and add **optional** `requireClientRole(KEYCLOAK_CLIENT_ID, 'API_USER')` on user-facing API routes so that once Keycloak assigns `API_USER`, only users with that role can call those routes. If you prefer zero risk of locking users out before all users have `API_USER` in Keycloak, you can defer the `requireClientRole('API_USER')` until after role assignment is done.

---

## 8. Testing Plan

### 8.1 Keycloak Setup Verification

1. Create two test users in Keycloak (realm `unified-visibility`):
   - **admin_user**: realm roles `default`, `PLATFORM_ADMIN`; client roles on `uv-backend`: `API_USER`, `API_ADMIN`.
   - **normal_user**: realm role `default`; client roles on `uv-backend`: `API_USER`.
2. Obtain access tokens for both (e.g. via Keycloak login page or token endpoint).
3. Decode tokens and confirm:
   - `realm_access.roles` and `resource_access['uv-backend'].roles` are present and correct.

### 8.2 Backend Unit / Integration (Optional)

- Test `getKeycloakRoles(payload)` and `getKeycloakClientRoles(payload, 'uv-backend')` with mock payloads.
- Test that `requireRole('PLATFORM_ADMIN')` calls `next()` when role present, and calls `next(ForbiddenError)` when absent (with valid payload).
- Test that `requireClientRole('uv-backend', 'API_USER')` behaves the same for client roles.
- Test error handler returns 403 for ForbiddenError.

### 8.3 API Tests (Manual or E2E)

1. **Without token**: Request to `GET /api/v1/api-keys` with no Authorization header → expect **401**.
2. **Invalid token**: Wrong or expired JWT → expect **401**.
3. **Valid token, no API_USER**: User with only `default` realm role and no `uv-backend` client roles → if you added `requireClientRole('API_USER')`, expect **403**; otherwise expect 200 (current behavior).
4. **Valid token, API_USER**: normal_user token → expect **200** on api-keys, metric-configs, code-generation, GET metrics.
5. **Admin route (when implemented)**: normal_user → expect **403**; admin_user → expect **200**.

### 8.4 Ownership Unchanged

- Confirm existing ownership checks still hold: api-keys and metric-configs are still filtered by `req.user.id` (no cross-user access). Authorization adds role checks; it does not change row-level security.

---

## 9. Implementation Order Checklist

Execute in this order, pausing after each step for approval before the next.

| Step | Description | Approval gate | Doc |
|------|-------------|----------------|-----|
| **1** | Keycloak: Create realm roles and client roles; assign to test users; verify token contents | Yes | [Step 1 — Keycloak config](authorization-step1-keycloak-config.md) ✓ |
| **2** | Backend: Add `ForbiddenError` and 403 handling in errorHandler | Yes |
| **3** | Backend: Add `getKeycloakClientRoles`, `requireClientRole`, use ForbiddenError in `requireRole`; optional helpers | Yes |
| **4** | Backend: Apply optional `requireClientRole('API_USER')` to chosen routes (or skip until Keycloak roles are assigned) | Yes |
| **5** | (Future) Add admin routes and protect with `requireRole('PLATFORM_ADMIN')` or `requireClientRole('API_ADMIN')` | When admin features exist |
| **6** | Testing: Run through 8.1–8.4 and document results | Yes |

---

**End of Implementation Plan.**

Once you approve this plan, we will proceed to **Phase 3 — Step-by-step implementation**, starting with Step 1 (Keycloak configuration) and pausing after each step for your confirmation.
