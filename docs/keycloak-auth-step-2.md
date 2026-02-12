# Step 2 — Backend Dual Token Validation

**Date**: 2026-02-12
**Branch**: `auth-step2`
**Status**: Complete — Awaiting approval

---

## 1. What Changed

### Files Modified
| File | Change |
|------|--------|
| `backend/package.json` | Added `jose@^6.1.3` dependency for JWKS-based token verification |
| `backend/src/middleware/auth.middleware.js` | Refactored into dual-auth middleware with `AUTH_PROVIDER` switch (`legacy` / `keycloak` / `both`) |
| `backend/src/database/connection.js` | Added idempotent migration to create `keycloak_id` column + index on `users` table |
| `docker/docker-compose.yml` | Added `KEYCLOAK_CLIENT_SECRET` default value and `KEYCLOAK_FRONTEND_CLIENT_ID` env var to backend service |

### Files Created
| File | Purpose |
|------|---------|
| `backend/src/middleware/keycloak.middleware.js` | Keycloak OIDC token validation, user resolution, and role utilities |
| `docs/keycloak-auth-step-2.md` | This documentation |

### What Was NOT Changed
- **Frontend code**: untouched
- **Auth routes** (`auth.routes.js`): untouched — legacy signup/signin/refresh still work exactly as before
- **API key middleware**: untouched — `authenticateApiKey` is completely independent of `AUTH_PROVIDER`
- **All other routes**: untouched — they import `authenticate` from `auth.middleware.js` and that export still exists with the same signature
- **Existing users**: untouched — no data migration, no schema breaking changes

---

## 2. Architecture Diagram

```
                          AUTH_PROVIDER = "both"
                          ─────────────────────

  Client Request                        Backend (Express)
  Authorization: Bearer <token>
        │
        ▼
  ┌─────────────────┐
  │   authenticate   │    ← Main middleware (auth.middleware.js)
  │   middleware      │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────┐
  │  Switch on AUTH_PROVIDER env var                      │
  │                                                       │
  │  "legacy"   → authenticateLegacy()                   │
  │               jwt.verify(token, JWT_SECRET)          │
  │               SELECT user by decoded.userId          │
  │                                                       │
  │  "keycloak" → authenticateKeycloak()                 │
  │               jose.jwtVerify(token, JWKS)            │
  │               Verify issuer, azp claims              │
  │               resolveLocalUser() by keycloak_id/email│
  │                                                       │
  │  "both"     → Try keycloak first                     │
  │               If fails → fall back to legacy         │
  └─────────────────────────────────────────────────────┘
           │
           ▼
     req.user = { id, email, name }     ← Same shape for all providers
     (+ req.keycloakPayload if KC)
           │
           ▼
     Route handler proceeds normally
```

### Token Verification Flow (Keycloak mode)

```
  Backend                             Keycloak Server
     │                                      │
     │──── GET /realms/{realm}/             │
     │     protocol/openid-connect/certs ──►│
     │                                      │
     │◄──── JWKS (public keys, cached) ─────│
     │                                      │
     │  jose.jwtVerify(token, JWKS)         │
     │  ✓ Signature valid (RS256)           │
     │  ✓ Issuer matches                    │
     │  ✓ Not expired                       │
     │  ✓ azp is uv-frontend or uv-backend │
     │                                      │
     │  resolveLocalUser(payload)           │
     │  1. SELECT by keycloak_id ──► DB     │
     │  2. SELECT by email ──► DB           │
     │  3. INSERT new user ──► DB           │
     │                                      │
     │  req.user = { id, email, name }      │
```

---

## 3. Detailed Explanation

### 3.1 Why `jose` Instead of `keycloak-connect`

| Criteria | `jose` | `keycloak-connect` |
|----------|--------|-------------------|
| **ESM support** | Native ESM (matches our `"type": "module"`) | CommonJS only, needs workarounds |
| **Dependencies** | Zero dependencies | Pulls in many transitive deps |
| **Size** | ~50 KB | ~2 MB+ with deps |
| **Approach** | Standards-based JWKS/JWT verification | Keycloak-specific adapter |
| **Flexibility** | Works with any OIDC provider | Keycloak-only |
| **Maintenance** | Actively maintained, IETF standards track | Tied to Keycloak release cycle |

`jose` gives us standard OIDC token verification without locking into Keycloak-specific APIs. If we ever switch identity providers, the verification logic stays almost identical.

### 3.2 The `keycloak_id` Column

```sql
ALTER TABLE users ADD COLUMN keycloak_id VARCHAR(255) UNIQUE;
CREATE INDEX idx_users_keycloak_id ON users(keycloak_id);
```

**Why this approach**:
- Keycloak uses UUID-based user IDs (e.g., `a1b2c3d4-e5f6-...`)
- Our `users.id` is `SERIAL` (integer) and referenced as FK by `api_keys`, `metric_configs`, `refresh_tokens`
- We **cannot** change `users.id` to UUID without breaking all FK relationships
- Adding `keycloak_id` as a mapping column is the safest approach
- The migration is idempotent — it uses `IF NOT EXISTS` and can run repeatedly

### 3.3 User Resolution Strategy

When a Keycloak token arrives, the middleware resolves the local user in 3 steps:

| Step | Lookup Method | Scenario |
|------|--------------|----------|
| 1 | `WHERE keycloak_id = $1` | User already linked (fastest path) |
| 2 | `WHERE email = $1` | Pre-existing user logging in via Keycloak for the first time. Back-fills `keycloak_id` so step 1 works next time |
| 3 | `INSERT INTO users (...)` | New user who registered through Keycloak directly. Auto-creates local user with `password_hash = '__keycloak_managed__'` |

**Important**: Auto-created users (step 3) have a placeholder `password_hash` value (`__keycloak_managed__`). This means:
- They cannot log in via the legacy JWT system (bcrypt compare will always fail on the placeholder)
- They can only authenticate through Keycloak
- This is intentional — Keycloak manages their credentials

### 3.4 The `AUTH_PROVIDER` Feature Flag

| Value | Behavior | Use Case |
|-------|---------|----------|
| `legacy` (default) | Only legacy JWT accepted | Current state — no Keycloak integration active |
| `keycloak` | Only Keycloak OIDC tokens accepted | After full migration, legacy disabled |
| `both` | Try Keycloak first, fall back to legacy | **Transition period** — both old and new tokens work |

**Current default is `legacy`** — this means the backend behavior is **identical** to before this change. No user-facing impact unless you explicitly change the env var.

### 3.5 JWKS Caching

The `jose.createRemoteJWKSet()` function:
- Fetches Keycloak's public signing keys on first request
- Caches them for up to **10 minutes** (`cacheMaxAge: 600_000`)
- Won't re-fetch more than once per **30 seconds** (`cooldownDuration: 30_000`)
- Automatically handles key rotation (if Keycloak rotates keys, the next verification will fetch the new set)

This means the backend does NOT make a network call to Keycloak on every request — only when the cache expires or a key is not found.

### 3.6 Role-Based Access Control (Future Ready)

The middleware exports two utilities for future use:

```javascript
import { requireRole, getKeycloakRoles } from './keycloak.middleware.js';

// Require admin role on a route
router.get('/admin-only', authenticate, requireRole('admin'), handler);

// Check roles manually
const roles = getKeycloakRoles(req.keycloakPayload);
if (roles.includes('admin')) { /* ... */ }
```

These are **not used yet** but are ready for the authorization phase.

---

## 4. Environment Variables

### New / Updated Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_PROVIDER` | `legacy` | Controls which auth middleware is active |
| `KEYCLOAK_ISSUER_URL` | (falls back to `KEYCLOAK_URL`) | Public-facing Keycloak URL for `iss` claim validation. In Docker, tokens are issued via `localhost:8080` but the backend reaches Keycloak at `keycloak:8080` — this variable resolves that mismatch. |
| `KEYCLOAK_CLIENT_SECRET` | `uv-backend-dev-secret` | Backend client secret (now has default for dev) |
| `KEYCLOAK_FRONTEND_CLIENT_ID` | `uv-frontend` | Frontend client ID (for token `azp` validation) |

### All Keycloak-Related Variables (set in Step 1, used in Step 2)

| Variable | Value | Set In |
|----------|-------|--------|
| `AUTH_PROVIDER` | `legacy` | docker-compose.yml |
| `KEYCLOAK_URL` | `http://keycloak:8080` | docker-compose.yml |
| `KEYCLOAK_ISSUER_URL` | `http://localhost:8080` | docker-compose.yml |
| `KEYCLOAK_REALM` | `unified-visibility` | docker-compose.yml |
| `KEYCLOAK_CLIENT_ID` | `uv-backend` | docker-compose.yml |
| `KEYCLOAK_CLIENT_SECRET` | `uv-backend-dev-secret` | docker-compose.yml |
| `KEYCLOAK_FRONTEND_CLIENT_ID` | `uv-frontend` | docker-compose.yml |

---

## 5. Security Considerations

| Concern | Assessment |
|---------|-----------|
| **Default is `legacy`** | No behavior change until explicitly switched — zero risk to existing users |
| **JWKS verification** | Tokens are verified using RSA public keys from Keycloak, not a shared secret. This is more secure than symmetric JWT_SECRET |
| **Token issuer validation** | The middleware checks that `iss` matches the expected Keycloak realm URL |
| **Client validation** | The `azp` (authorized party) claim is checked against known client IDs |
| **Auto-created users** | Have placeholder password_hash, cannot use legacy login — Keycloak-only |
| **SQL injection** | All queries use parameterized placeholders (`$1`, `$2`) — no injection risk |
| **JWKS cache** | Keys are cached for 10 min. If Keycloak is compromised, revoked tokens could be valid for up to 10 min until key rotation is detected |
| **`both` mode** | During transition, if the Keycloak server is down, legacy tokens still work (graceful degradation) |

---

## 6. Testing Instructions

### 6.1 Prerequisites

- Docker and Docker Compose running (from Step 1)
- Keycloak up and healthy at `http://localhost:8080`
- Backend running at `http://localhost:3000`
- Your existing `.env` file with DB and Keycloak credentials

### 6.2 Test 1: Existing Auth Still Works (AUTH_PROVIDER=legacy)

**This is the most important test — verify nothing is broken.**

```bash
# 1. Make sure AUTH_PROVIDER is "legacy" (default)
# No changes needed — this is the default

# 2. Rebuild and restart the backend
cd docker/
docker compose up -d --build backend

# 3. Wait for backend to be healthy
docker compose logs -f backend
# Look for: "✅ Database initialized successfully"
# Look for: "🔐 Auth provider: legacy"

# 4. Sign in with existing credentials (legacy JWT)
curl -s -X POST http://localhost:3000/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "your-password"}' | head -c 500

# Expected: { "success": true, "data": { "user": {...}, "accessToken": "...", "refreshToken": "..." } }

# 5. Use the access token on a protected route
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NzA4OTU2MjMsImV4cCI6MTc3MDg5NjUyM30.yZQkKo8QOlEUW7u2GrRlh3AsnaoXr2l8M6iVaeqAjtE"
curl -s http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer $TOKEN" | head -c 500

# Expected: { "success": true, "data": [...] }
```

### 6.3 Test 2: Database Migration (keycloak_id column)

```bash
# Connect to your database and verify the new column exists
# Option A: Using psql
# psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "\d users"

# Option B: Via the backend logs — look for "✅ Migrations completed"
docker compose logs backend | grep -i "migration"

# Option C: Direct SQL query
# SELECT column_name, data_type FROM information_schema.columns 
# WHERE table_name = 'users' AND column_name = 'keycloak_id';

# Expected: keycloak_id column of type VARCHAR(255), nullable, unique
```

### 6.4 Test 3: Keycloak Token Validation (AUTH_PROVIDER=both)

```bash
# 1. Switch to dual-auth mode
# Edit docker/.env and add (or change):
#   AUTH_PROVIDER=both

# Or set it inline when starting:
AUTH_PROVIDER=both docker compose up -d --build backend

# 2. Verify the auth provider mode
docker compose logs backend | grep "Auth provider"
# Expected: "🔐 Auth provider: both"

# 3. Get a Keycloak token
# First, create a test user in Keycloak:
#   a. Open http://localhost:8080
#   b. Login as admin/admin
#   c. Switch to "unified-visibility" realm
#   d. Go to Users → Add User
#   e. Set Email: testuser@example.com, First Name: Test, Last Name: User
#   f. Click Create
#   g. Go to Credentials tab → Set Password → "test1234" → toggle off Temporary
#
# Or use the Keycloak API (Direct Access Grant via uv-frontend public client):

KC_TOKEN=$(curl -s -X POST \
  "http://localhost:8080/realms/unified-visibility/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=uv-frontend" \
  -d "scope=openid email profile" \
  -d "username=testuser@example.com" \
  -d "password=test1234" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Keycloak token: $KC_TOKEN"

# 4. Use the Keycloak token on a protected backend route
curl -s http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer $KC_TOKEN" | head -c 500

# Expected: { "success": true, "data": [...] }
# Backend logs should show: "🔗 Linked Keycloak user ... to existing local user ..."
# or: "✨ Auto-created local user ... for Keycloak user ..."

# 5. Verify legacy tokens STILL work alongside Keycloak tokens
# Sign in with legacy credentials
LEGACY_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email": "meow@gmail.com", "password": "meow1234"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer $LEGACY_TOKEN" | head -c 500

# Expected: { "success": true, "data": [...] } — legacy tokens still work!
```

### 6.5 Test 4: Keycloak-Only Mode (AUTH_PROVIDER=keycloak)

```bash
# 1. Switch to keycloak-only mode
# Edit docker/.env: AUTH_PROVIDER=keycloak
AUTH_PROVIDER=keycloak docker compose up -d --build backend

# 2. Try a legacy token — should be REJECTED
LEGACY_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NzA4OTYwNTEsImV4cCI6MTc3MDg5Njk1MX0.wOShSnHtTsyfGLGaMQa7YGb3gPDbVhUjJNEmmkeZU_A"
curl -s http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer $LEGACY_TOKEN"

# Expected: 401 Unauthorized (legacy tokens no longer accepted)

# 3. Try a Keycloak token — should WORK
curl -s http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer $KC_TOKEN"

# Expected: { "success": true, ... }
```

### 6.6 Test 5: API Key Auth is Unaffected

```bash
# API key auth should work regardless of AUTH_PROVIDER setting
curl -s http://localhost:3000/api/v1/metric-configs/by-api-key \
  -H "X-API-Key: mk_53cc9a91f77fd65430f8789562ebfad8321844946f6c455f6c8e1b926622a0e3"

# Expected: { "success": true, ... } — no change from before
```

### 6.7 Test 6: User Mapping Verification

```bash
# After Test 3 or 4, verify the keycloak_id was populated
# Query your database:
# SELECT id, email, keycloak_id FROM users;

# Expected:
# - Pre-existing users who logged in via Keycloak will have keycloak_id populated
# - Pre-existing users who only used legacy login will have NULL keycloak_id
# - New users created via Keycloak will have keycloak_id and password_hash = '__keycloak_managed__'
```

### 6.8 REST Client Test File (Recommended)

Instead of fighting with bash quoting, use the **REST Client** VS Code/Cursor extension:

1. Install the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension
2. Open `tests/api-test.http`
3. Update the `@kcUsername`, `@kcPassword`, `@legacyEmail`, `@legacyPassword` variables at the top
4. Click **"Send Request"** above each request block

The file chains requests automatically — the Keycloak token from request 1 is injected into requests 3 and 4 via `{{kcLogin.response.body.access_token}}`. No copy-paste needed.

---

## 7. Verification Checklist

### Must Pass (AUTH_PROVIDER=legacy — default)
- [ ] `docker compose up -d --build backend` succeeds
- [ ] Backend logs show `🔐 Auth provider: legacy`
- [ ] Backend logs show `✅ Migrations completed` (keycloak_id column created)
- [ ] Legacy signin works (`POST /api/v1/auth/signin`)
- [ ] Legacy access token works on protected routes
- [ ] Token refresh works (`POST /api/v1/auth/refresh`)
- [ ] API key auth works (unaffected)
- [ ] Health check works (`GET /health`)
- [ ] Prometheus scraping works (`GET /metrics`)
- [ ] `users` table has `keycloak_id` column (nullable, unique, indexed)

### Must Pass (AUTH_PROVIDER=both — transition mode)
- [ ] Backend logs show `🔐 Auth provider: both`
- [ ] Legacy tokens still accepted (fall back from Keycloak)
- [ ] Keycloak tokens accepted (verified via JWKS)
- [ ] User linking works (existing user + Keycloak token → `keycloak_id` back-filled)
- [ ] User auto-creation works (new Keycloak user → local user created)
- [ ] API key auth still works (unaffected)

### Must Pass (AUTH_PROVIDER=keycloak — post-migration)
- [ ] Backend logs show `🔐 Auth provider: keycloak`
- [ ] Only Keycloak tokens accepted
- [ ] Legacy tokens rejected with 401
- [ ] API key auth still works (unaffected)

---

## 8. Failure Scenarios & Troubleshooting

| Scenario | Symptom | Fix |
|----------|---------|-----|
| Keycloak not running | `ERR_JWKS_NO_MATCHING_KEY` or connection refused | Ensure Keycloak is healthy: `docker compose ps keycloak` |
| Wrong JWKS URL | `FetchError` or timeout | Check `KEYCLOAK_URL` env var; from inside Docker it should be `http://keycloak:8080` |
| Issuer mismatch (localhost vs Docker hostname) | `JWT claim validation failed` or `Invalid or expired token` (when `AUTH_PROVIDER=both`) | Set `KEYCLOAK_ISSUER_URL=http://localhost:8080` — the public URL that appears in the token's `iss` claim. `KEYCLOAK_URL` stays as the internal Docker URL for JWKS fetching. |
| Token missing `sub`/`email` claims | `Keycloak token missing "sub" claim` or `missing "email" claim` | Add `scope=openid email profile` to the token request. Also verify client scopes in Keycloak admin console. |
| Token from wrong realm | `JWT claim validation failed: iss` | Verify `KEYCLOAK_REALM` matches the token's realm |
| Token from unknown client | `Token was issued to unexpected client` | Ensure token was issued by `uv-frontend` or `uv-backend` |
| Migration fails | `relation "users" does not exist` | This means the base migrations haven't run yet — check DB connection |
| Backend won't start | Import error for `jose` | Run `npm install` in the backend directory; verify `jose` is in `package.json` |
| `keycloak_id` column missing | Keycloak auth returns user not found | Restart backend — migration runs on startup |

---

## 9. Rollback

To completely revert Step 2 and go back to Step 1:

### Quick Rollback (no code changes)
```bash
# Set AUTH_PROVIDER back to legacy — instant rollback, no restart needed
# (actually, requires restart since env is read at startup)
AUTH_PROVIDER=legacy docker compose up -d --build backend
```

### Full Rollback (code revert)
```bash
# 1. Revert code changes
git checkout backend/src/middleware/auth.middleware.js
git checkout backend/src/database/connection.js
git checkout backend/package.json
git checkout docker/docker-compose.yml
rm backend/src/middleware/keycloak.middleware.js

# 2. Rebuild
cd docker/
docker compose up -d --build backend

# 3. (Optional) Remove keycloak_id column
# psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> \
#   -c "ALTER TABLE users DROP COLUMN IF EXISTS keycloak_id;"
```

**Note**: The `keycloak_id` column is nullable and has no effect on existing queries. Leaving it in place is harmless.

---

## 10. Files Changed — Full Diff Summary

### `backend/package.json`
- Added `"jose": "^6.1.3"` to dependencies

### `backend/src/middleware/keycloak.middleware.js` (NEW)
- `verifyKeycloakToken(token)` — validates JWT against Keycloak JWKS
- `resolveLocalUser(payload)` — maps Keycloak user to local `users` row
- `authenticateKeycloak` — Express middleware combining verification + user resolution
- `getKeycloakRoles(payload)` — utility to extract realm roles
- `requireRole(...roles)` — middleware factory for role-based access control

### `backend/src/middleware/auth.middleware.js` (MODIFIED)
- Refactored `authenticate` into a switch on `AUTH_PROVIDER`
- Original logic preserved as `authenticateLegacy` (private function)
- Added `authenticateBoth` for dual-auth fallback logic
- `authenticateApiKey` — completely unchanged

### `backend/src/database/connection.js` (MODIFIED)
- Added migration to create `keycloak_id VARCHAR(255) UNIQUE` column on `users` table
- Added index `idx_users_keycloak_id`
- Migration is idempotent (uses `IF NOT EXISTS` / `DO $$ ... $$`)

### `docker/docker-compose.yml` (MODIFIED)
- Set default for `KEYCLOAK_CLIENT_SECRET` (`uv-backend-dev-secret`)
- Added `KEYCLOAK_FRONTEND_CLIENT_ID` env var to backend service

---

**STEP 2 COMPLETE — Awaiting approval to continue.**

**Next recommended step**: Step 3 — Frontend OIDC Integration
- Install `keycloak-js` adapter in the React frontend
- Create Keycloak initialization module
- Update `authStore.js` (Zustand) with dual auth support
- Add Keycloak login/signup buttons alongside existing forms
- Update Axios client to attach Keycloak tokens
- Feature flag: `VITE_AUTH_PROVIDER=legacy|keycloak|both`
