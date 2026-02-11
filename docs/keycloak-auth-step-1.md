# Step 1 — Keycloak Infrastructure Setup

**Date**: 2026-02-11
**Branch**: `auth-branch`
**Status**: Complete — Awaiting approval

---

## 1. What Changed

### Files Modified
| File | Change |
|------|--------|
| `docker/docker-compose.yml` | Added `keycloak-db` and `keycloak` services; added `keycloak_postgres_data` volume; added Keycloak env vars to `backend` service |

### Files Created
| File | Purpose |
|------|---------|
| `docker/keycloak/realm-export.json` | Pre-configured Keycloak realm with OIDC clients |
| `docs/keycloak-auth-step-1.md` | This documentation |

### No Application Code Changed
- Backend code: **untouched**
- Frontend code: **untouched**
- Database schema: **untouched**
- Existing auth flow: **untouched**

---

## 2. Architecture Diagram

```
                         YOUR CLOUD POSTGRESQL (single database)
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    │  "public" schema         "keycloak" schema   │
                    │  (app tables)            (Keycloak tables)   │
                    │  ────────────            ─────────────────   │
                    │  users                   realm               │
                    │  api_keys                client              │
                    │  metric_configs          user_entity         │
                    │  refresh_tokens          credential          │
                    │                          ...                 │
                    └──────────┬──────────────────────┬────────────┘
                               │                      │
                               │ pg driver            │ JDBC
                               │                      │
┌──────────────────────────────┼──────────────────────┼────────────┐
│              Docker Compose  │                      │            │
│                              │                      │            │
│                      ┌───────┴──────┐        ┌──────┴───────┐   │
│                      │   backend    │        │  keycloak    │   │
│                      │  :3000       │        │  :8080       │   │
│                      │              │        │              │   │
│                      │ AUTH_PROVIDER│        │  Realm:      │   │
│                      │ = legacy     │        │  unified-    │   │
│                      └──────────────┘        │  visibility  │   │
│                             ▲                └──────────────┘   │
│                             │                                    │
│                      ┌──────┴──────┐   ┌──────────────┐        │
│                      │ prometheus  │   │   grafana    │        │
│                      │ :9090       │   │   :3001      │        │
│                      └─────────────┘   └──────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

**Key point**: Both the backend and Keycloak connect to the **same cloud PostgreSQL**, but they use **separate schemas** — app tables live in `public`, Keycloak tables live in `keycloak`. They cannot interfere with each other. The `AUTH_PROVIDER` is set to `legacy` — the backend still uses the existing JWT auth. Keycloak is running but not yet integrated.

---

## 3. Configuration Explanation

### 3.1 Docker Services Added

#### `keycloak` (Identity Provider)
- **Image**: `quay.io/keycloak/keycloak:26.0` (latest stable)
- **Command**: `start-dev --import-realm` (dev mode + auto-imports realm config on first boot)
- **Port**: `8080` (Keycloak admin console and OIDC endpoints)
- **Database**: Uses the **same cloud PostgreSQL** as the app, but with `KC_DB_SCHEMA=keycloak` to store all Keycloak tables in a separate `keycloak` schema — keeping them fully isolated from app tables (`users`, `api_keys`, etc. live in the default `public` schema)
- **Health check**: HTTP check on `/health/ready`
- **Realm import**: Mounts `./keycloak/realm-export.json` for automatic setup
- **env_file**: Loads `.env` to pick up `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### 3.2 Realm Configuration (`realm-export.json`)

| Setting | Value | Reason |
|---------|-------|--------|
| **Realm name** | `unified-visibility` | Matches your project name |
| **Registration allowed** | `true` | Users can self-register via Keycloak |
| **Email as username** | `true` | Matches your current email-based login |
| **Password policy** | `length(8)` | Matches your current 8-char minimum |
| **Brute force protection** | Enabled, 5 failures | Similar to your current `authLimiter` (5 req/min) |
| **Access token lifespan** | 900s (15 min) | Matches your current `JWT_ACCESS_EXPIRY` default |
| **SSO session idle** | 1800s (30 min) | Reasonable idle timeout |

### 3.3 OIDC Clients Configured

#### `uv-frontend` (Public Client — for React SPA)
| Setting | Value | Reason |
|---------|-------|--------|
| **Type** | Public (no secret) | SPAs cannot securely store secrets |
| **Flow** | Authorization Code + PKCE (S256) | Industry standard for SPAs |
| **Direct Access Grants** | Enabled | Allows password-based login for testing |
| **Redirect URIs** | `http://localhost:5173/*` | Your Vite dev server |
| **Web Origins** | `http://localhost:5173`, `http://localhost:3000` | CORS allowlist |
| **Token lifespan** | 900s (15 min) | Matches existing access token expiry |

#### `uv-backend` (Confidential Client — for token validation)
| Setting | Value | Reason |
|---------|-------|--------|
| **Type** | Confidential (has secret) | Backend can securely store secrets |
| **Flow** | Service accounts only | Backend validates tokens, doesn't initiate login |
| **Secret** | `uv-backend-dev-secret` | Dev-only; change in production |
| **Bearer Only** | false | Can also use service account for admin API calls |

### 3.4 Roles Configured
| Role | Purpose |
|------|---------|
| `user` | Default role assigned to all registered users |
| `admin` | Administrator role (for future authorization phase) |

### 3.5 Backend Environment Variables Added

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_PROVIDER` | `legacy` | Currently set to `legacy` — no behavioral change |
| `KEYCLOAK_URL` | `http://keycloak:8080` | Internal Docker URL for backend-to-Keycloak |
| `KEYCLOAK_REALM` | `unified-visibility` | Realm name |
| `KEYCLOAK_CLIENT_ID` | `uv-backend` | Backend client ID |
| `KEYCLOAK_CLIENT_SECRET` | (empty) | Will be set in Step 2 |

---

## 4. Security Implications

| Concern | Assessment |
|---------|-----------|
| **Existing auth unaffected** | `AUTH_PROVIDER=legacy` means backend ignores Keycloak entirely |
| **Keycloak admin console exposed** | Port 8080 — dev mode only. In production, use HTTPS + strong admin password |
| **Default admin credentials** | `admin/admin` — must be changed for production |
| **Backend client secret** | `uv-backend-dev-secret` — dev only, will be rotated |
| **Schema isolation** | Keycloak uses `keycloak` schema in cloud DB; app uses `public` schema — no table conflicts |
| **Network exposure** | Keycloak is on same Docker network but not connected to any app service yet |

---

## 5. Testing Instructions

### 5.1 Prerequisites
- Docker and Docker Compose installed
- Your existing `docker/.env` file with cloud DB credentials

### 5.2 Start the Services

```bash
# From the docker/ directory
cd docker/

# Start all services (Keycloak + existing services)
docker compose up -d

# Watch Keycloak startup (takes 30-60 seconds on first boot)
docker compose logs -f keycloak
```

Wait until you see:
```
Keycloak ... started in Xs
```

### 5.3 Test Cases

#### Test 1: Keycloak Admin Console Accessible
1. Open browser: `http://localhost:8080`
2. Click "Administration Console"
3. Login with `admin` / `admin`
4. **Expected**: You see the Keycloak admin dashboard

#### Test 2: Realm Was Imported
1. In admin console, click the realm dropdown (top-left, says "Keycloak" or "master")
2. **Expected**: You see `unified-visibility` realm listed
3. Select it
4. **Expected**: Realm dashboard shows "Unified Visibility Platform"

#### Test 3: Clients Were Created
1. Navigate to: Clients (left sidebar)
2. **Expected**: You see `uv-frontend` and `uv-backend` in the clients list
3. Click `uv-frontend`
4. **Expected**: Public client, redirect URIs include `http://localhost:5173/*`
5. Click `uv-backend`
6. **Expected**: Confidential client with credentials tab showing the secret

#### Test 4: OIDC Discovery Endpoint Works
```bash
curl -s http://localhost:8080/realms/unified-visibility/.well-known/openid-configuration | head -20
```
**Expected**: JSON with `authorization_endpoint`, `token_endpoint`, `jwks_uri`, etc.

#### Test 5: Existing Application Still Works
1. Your backend at `http://localhost:3000/health` should still return healthy
2. Frontend at `http://localhost:5173` should still load and login should work as before
3. Prometheus at `http://localhost:9090` should still be scraping
4. Grafana at `http://localhost:3001` should still work

**This is the most important test** — Keycloak's addition must not break anything.

#### Test 6: Keycloak Schema is Separate from App Schema
```bash
# Connect to your cloud DB and list schemas
# You should see both "public" (app) and "keycloak" (Keycloak) schemas
# The Keycloak tables live only inside the "keycloak" schema

# List Keycloak tables (should show realm, client, user_entity, etc.)
# Use your cloud DB connection tool or psql:
# psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "\dt keycloak.*"

# List app tables (should show users, api_keys, metric_configs, etc.)
# psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "\dt public.*"
```

### 5.4 Quick Verification Commands

```bash
# Check all containers are running
docker compose ps

# Expected output should show:
#   metrics_keycloak   — running (healthy)  
#   metrics_backend    — running (healthy)
#   metrics_prometheus — running
#   metrics_grafana    — running

# Check Keycloak health
curl -s http://localhost:8080/health/ready

# Expected: {"status":"UP","checks":[...]}
```

### 5.5 Failure Scenarios

| Scenario | Symptom | Fix |
|----------|---------|-----|
| Port 8080 already in use | Keycloak fails to start | Change port mapping in docker-compose: `"8081:8080"` |
| Realm not imported | No `unified-visibility` realm | Delete keycloak volume: `docker volume rm docker_keycloak_postgres_data`, then restart |
| Keycloak slow to start | Health check fails initially | Normal — first boot takes 60-90s. `start_period: 60s` accounts for this |
| Backend can't reach cloud DB | Backend health fails | Unrelated to Keycloak — check your `.env` DB credentials |
| Out of memory | Containers crash | Keycloak needs ~512MB. Ensure system has enough free RAM |

### 5.6 Rollback Steps

To completely remove Keycloak (zero impact on application):

```bash
# Stop Keycloak
docker compose stop keycloak

# Remove container
docker compose rm -f keycloak

# (Optional) Drop Keycloak schema from cloud DB to clean up tables
# psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "DROP SCHEMA keycloak CASCADE;"
```

To fully revert:
1. `git checkout docker/docker-compose.yml` — restores original compose file
2. `rm -rf docker/keycloak/` — removes realm config directory
3. `docker compose up -d` — restart without Keycloak
4. (Optional) Drop the `keycloak` schema from cloud DB if you want to remove Keycloak's tables

---

## 6. Verification Checklist

- [ ] `docker compose up -d` succeeds with no errors
- [ ] `metrics_keycloak` container is running and healthy
- [ ] Keycloak admin console accessible at `http://localhost:8080`
- [ ] Admin login works with `admin` / `admin`
- [ ] `unified-visibility` realm exists
- [ ] `uv-frontend` client exists (public, redirect to localhost:5173)
- [ ] `uv-backend` client exists (confidential, has secret)
- [ ] OIDC discovery endpoint returns valid JSON
- [ ] Existing backend still healthy (`http://localhost:3000/health`)
- [ ] Existing frontend still loads and login works
- [ ] Existing Prometheus still scraping
- [ ] Existing Grafana still accessible
- [ ] Cloud DB has `keycloak` schema with Keycloak tables
- [ ] Cloud DB `public` schema (app tables) is untouched

---

## 7. What Was NOT Changed

- **No application code** was modified (backend or frontend)
- **No database schema** changes to your cloud PostgreSQL
- **No existing auth behavior** changed (`AUTH_PROVIDER=legacy`)
- **No API contracts** changed
- **No UI changes**
- **No dependency changes** in `package.json` files

---

**STEP 1 COMPLETE — Awaiting approval to continue.**

**Next recommended step**: Step 2 — Backend Dual Token Validation
- Install JWKS/OIDC token verification library
- Create `keycloak.middleware.js` for Keycloak token validation
- Wrap `authenticate` middleware with dual-auth logic (Keycloak OR legacy JWT)
- Add `keycloak_id` mapping column to `users` table on cloud DB
- Feature flag: `AUTH_PROVIDER=legacy|keycloak|both`
