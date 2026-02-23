# Keycloak AAA Migration — Overview & Design Document

**Date**: 2026-02-11
**Branch**: `auth-branch`
**Status**: Phase 0 — Repository Understanding (NO CODE CHANGES)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Authentication System Analysis](#2-current-authentication-system-analysis)
3. [System Architecture Analysis](#3-system-architecture-analysis)
4. [Integration Constraints](#4-integration-constraints)
5. [Keycloak Migration Strategy](#5-keycloak-migration-strategy)
6. [Authentication Phase — Detailed Plan](#6-authentication-phase--detailed-plan)
7. [Risk Assessment](#7-risk-assessment)
8. [Rollback Strategy](#8-rollback-strategy)

---

## 1. Executive Summary

This document describes the migration from a manually implemented JWT-based authentication system to Keycloak-based AAA (Authentication, Authorization, Accounting) for the Unified Visibility Platform.

**Current State**: Custom JWT auth with bcrypt password hashing, refresh token rotation, localStorage-based session management.

**Target State**: Keycloak-managed authentication with OIDC/OAuth2 tokens, centralized user management, and SSO capability.

**Approach**: Phased migration with parallel auth support during transition. No existing auth will be removed until replacement is fully verified.

---

## 2. Current Authentication System Analysis

### 2.1 Login Flow

```
User (Browser)                Frontend (React)              Backend (Express)             PostgreSQL
      |                            |                              |                          |
      |-- Enter credentials ------>|                              |                          |
      |                            |-- POST /api/v1/auth/signin ->|                          |
      |                            |                              |-- SELECT user by email -->|
      |                            |                              |<-- user row --------------|
      |                            |                              |-- bcrypt.compare() ------>|
      |                            |                              |-- Generate JWT pair ------>|
      |                            |                              |-- Store refresh token ---->|
      |                            |                              |                          |
      |                            |<-- { accessToken,            |                          |
      |                            |     refreshToken, user } ----|                          |
      |                            |                              |                          |
      |                            |-- Store in localStorage      |                          |
      |                            |-- Redirect to / ------------>|                          |
      |<-- Dashboard shown --------|                              |                          |
```

### 2.2 Session / Token Handling

| Aspect | Implementation |
|--------|---------------|
| **Access Token** | JWT, signed with `JWT_SECRET` env var, 15 min expiry |
| **Refresh Token** | JWT, signed with same `JWT_SECRET`, 7 day expiry |
| **Token Storage (Client)** | `localStorage` under key `auth-storage` (JSON blob with user, accessToken, refreshToken, isAuthenticated) |
| **Token Storage (Server)** | Refresh tokens stored in `refresh_tokens` table in PostgreSQL |
| **Token Refresh** | Axios response interceptor catches 401, calls `POST /api/v1/auth/refresh`, retries original request |
| **Token Rotation** | On signin: all old refresh tokens for user deleted, new one stored. On refresh: old token deleted, new pair issued |
| **State Management** | Zustand store (`useAuthStore`) with `setAuth`, `logout`, `updateToken` actions |

### 2.3 Password Storage

- **Library**: `bcryptjs`
- **Rounds**: 12
- **Column**: `users.password_hash` (VARCHAR 255)
- **Minimum Length**: 8 characters (validated via `express-validator`)

### 2.4 Middleware / Guards

| Middleware | File | Purpose | Used By |
|-----------|------|---------|---------|
| `authenticate` | `auth.middleware.js` | Validates JWT Bearer token, loads user from DB | API keys, metric configs, code generation, GET metrics |
| `authenticateApiKey` | `auth.middleware.js` | Validates `X-API-Key` header, loads API key + user | POST /api/v1/metrics (metric ingestion) |
| `authLimiter` | `rateLimiter.js` | 5 req/min for auth endpoints | signup, signin, password-reset |
| `apiLimiter` | `rateLimiter.js` | 100 req/min general | API keys, metric configs, code generation |
| `metricsLimiter` | `rateLimiter.js` | 100 req/min per API key | POST /api/v1/metrics |

### 2.5 Token Usage Summary

| Token Type | Format | Where Used | Validation |
|-----------|--------|-----------|------------|
| Access Token (JWT) | `Bearer <token>` in Authorization header | All authenticated API routes | `jwt.verify()` + DB user lookup |
| Refresh Token (JWT) | POST body to `/api/v1/auth/refresh` | Token renewal | `jwt.verify()` + DB token lookup |
| API Key | `X-API-Key` header or `api_key` query param | Metrics ingestion, tracker.js, metric-configs/by-api-key | DB lookup (`api_keys` table) |

### 2.6 Auth Entry Points (Backend Routes)

| Route | Auth Method | Purpose |
|-------|-----------|---------|
| `POST /api/v1/auth/signup` | None (public) | User registration |
| `POST /api/v1/auth/signin` | None (public) | User login |
| `POST /api/v1/auth/refresh` | Refresh token in body | Token renewal |
| `POST /api/v1/auth/password-reset-request` | None (public) | Password reset (stub) |
| `GET/POST/PATCH/DELETE /api/v1/api-keys/*` | JWT `authenticate` | API key management |
| `GET/POST/PATCH/DELETE /api/v1/metric-configs/*` | JWT `authenticate` | Metric config management |
| `GET /api/v1/metric-configs/by-api-key` | API key (no JWT) | Client library config fetch |
| `POST /api/v1/code-generation` | JWT `authenticate` | Code snippet generation |
| `POST /api/v1/metrics` | API key `authenticateApiKey` | Metrics ingestion from clients |
| `GET /api/v1/metrics` | JWT `authenticate` | Metrics info page |
| `GET /api/v1/tracker.js` | API key (query param `k`) | Dynamic JS library serving |
| `GET /metrics` | None (public) | Prometheus scraping endpoint |
| `GET /health` | None (public) | Health check |

### 2.7 Auth Dependencies

**Backend**:
- `jsonwebtoken` ^9.0.2 — JWT sign/verify
- `bcryptjs` ^2.4.3 — Password hashing
- `express-validator` ^7.0.1 — Input validation
- `express-rate-limit` ^7.1.5 — Rate limiting

**Frontend**:
- `zustand` ^4.4.7 — Auth state management
- `axios` ^1.6.2 — HTTP client with interceptors
- `react-router-dom` ^6.20.1 — Route protection (`PrivateRoute`)

### 2.8 Database Schema (Auth-Related)

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Note**: `api_keys` and `metric_configs` tables reference `users(id)` as foreign key. This is a critical constraint — Keycloak user IDs must map to these existing relations.

---

## 3. System Architecture Analysis

### 3.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite 5, Zustand state management, React Router 6 |
| **Backend** | Node.js 20 + Express 5 (ESM modules) |
| **Database** | PostgreSQL 15 (via `pg` driver) |
| **Metrics** | Prometheus (scraping), Grafana (visualization), prom-client (registry) |
| **Deployment** | Docker Compose (backend, prometheus, grafana; optional local postgres) |

### 3.2 Auth Boundaries

```
                    ┌──────────────────────────────────────────────────┐
                    │            PUBLIC ZONE (No Auth)                  │
                    │                                                    │
                    │  GET /health                                      │
                    │  GET /metrics (Prometheus scrape)                 │
                    │  POST /api/v1/auth/signup                        │
                    │  POST /api/v1/auth/signin                        │
                    │  POST /api/v1/auth/refresh                       │
                    │  POST /api/v1/auth/password-reset-request        │
                    └──────────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────────┐
                    │          JWT AUTH ZONE (Bearer Token)             │
                    │                                                    │
                    │  /api/v1/api-keys/*                               │
                    │  /api/v1/metric-configs/* (except by-api-key)     │
                    │  /api/v1/code-generation                          │
                    │  GET /api/v1/metrics                              │
                    └──────────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────────┐
                    │          API KEY AUTH ZONE (X-API-Key)            │
                    │                                                    │
                    │  POST /api/v1/metrics (ingestion)                │
                    │  GET /api/v1/tracker.js?k=<key>                  │
                    │  GET /api/v1/metric-configs/by-api-key           │
                    └──────────────────────────────────────────────────┘
```

### 3.3 API Structure

- All API routes under `/api/v1/`
- RESTful design
- JSON request/response
- Centralized error handler middleware
- CORS: strict for admin frontend, permissive for metrics/tracker endpoints

### 3.4 Deployment Model

- Backend runs in Docker container (port 3000)
- Frontend runs as Vite dev server (port 5173) or static build
- PostgreSQL can be local Docker or external (e.g., Render.com)
- Prometheus scrapes backend `/metrics` endpoint
- Grafana connects to Prometheus datasource
- Docker Compose orchestrates backend + prometheus + grafana

---

## 4. Integration Constraints

### 4.1 Where Auth is Enforced

1. **Backend middleware** (`auth.middleware.js`): `authenticate` function on protected routes
2. **Frontend route guard** (`App.jsx`): `PrivateRoute` component checks `isAuthenticated` from Zustand store
3. **Frontend API client** (`client.js`): Axios interceptor auto-attaches Bearer token, handles 401 with refresh logic
4. **API Key validation**: Separate middleware for client-facing endpoints

### 4.2 External Clients

- **Client websites** use API keys (not JWT) to send metrics. These are NOT affected by the auth migration.
- **Prometheus** scrapes `/metrics` endpoint (no auth). NOT affected.
- **Grafana** connects to Prometheus. NOT affected.

### 4.3 Service-to-Service Auth

- No service-to-service auth currently exists
- Prometheus -> Backend `/metrics` is unauthenticated (by design)
- All inter-service communication is within Docker network

### 4.4 Monitoring Impact

- The `/metrics` endpoint must remain public for Prometheus
- Health check `/health` must remain public
- No auth changes should affect metric collection pipeline
- API Key-based endpoints must remain untouched during migration

### 4.5 Critical Constraint: User ID Mapping

The `users.id` (SERIAL/integer) is referenced as foreign key by:
- `refresh_tokens.user_id`
- `api_keys.user_id`
- `metric_configs.user_id`

Keycloak generates UUID-based user IDs. **We must maintain the existing integer `users.id` as the primary reference** and create a mapping column (e.g., `keycloak_id`) or use a mapping table. We CANNOT change the `users.id` type without breaking all FK relationships.

---

## 5. Keycloak Migration Strategy

### 5.1 Phased Approach

| Step | Name | Description | Status |
|------|------|------------|--------|
| 0 | Repository Understanding | Analyze codebase, document current auth | **DONE** |
| 1 | Keycloak Infrastructure | Add Keycloak to Docker Compose, configure realm | **DONE** |
| 2 | Backend Token Validation | Add Keycloak token verification alongside existing JWT | **DONE** |
| 3 | Frontend OIDC Integration | Add Keycloak JS adapter, parallel auth | **DONE** |
| 4 | User Migration & Mapping | Migrate existing users, establish ID mapping | Pending |
| 5 | Cutover & Cleanup | Remove old auth code after verification | Pending (needs approval) |

### 5.2 Parallel Auth Strategy

During transition, the backend will support BOTH:
1. **Existing JWT** (current `authenticate` middleware)
2. **Keycloak OIDC tokens** (new middleware)

A feature flag (`AUTH_PROVIDER=legacy|keycloak|both`) will control which auth is active.

### 5.3 Architecture After Migration

```
User (Browser)         Keycloak              Frontend (React)         Backend (Express)       PostgreSQL
     |                     |                       |                        |                      |
     |-- Login ----------->|                       |                        |                      |
     |<-- Keycloak form ---|                       |                        |                      |
     |-- Credentials ----->|                       |                        |                      |
     |<-- OIDC tokens -----|                       |                        |                      |
     |                     |                       |                        |                      |
     |-- Access app ------>|                       |                        |                      |
     |                     |                       |-- API call w/ token -->|                      |
     |                     |                       |                        |-- Verify token       |
     |                     |                       |                        |   (Keycloak public   |
     |                     |                       |                        |    key / JWKS)       |
     |                     |                       |                        |-- Map KC user to     |
     |                     |                       |                        |   local user ------->|
     |                     |                       |<-- Response ----------|                      |
```

---

## 6. Authentication Phase — Detailed Plan

### Step 1: Keycloak Infrastructure Setup

**What changes**:
- Add Keycloak to `docker/docker-compose.yml` (uses cloud PostgreSQL with separate `keycloak` schema)
- Create realm configuration (JSON export)
- Configure OIDC client for the frontend app
- Configure OIDC client for the backend (for token validation)

**Files affected**:
- `docker/docker-compose.yml` (add keycloak service)
- `docker/keycloak/` (new directory for realm config)
- `docs/keycloak-auth-step-1.md` (documentation)

**No application code changes.**

### Step 2: Backend — Dual Token Validation

**What changes**:
- Install `keycloak-connect` or `jwks-rsa` + `jose` for OIDC token verification
- Create new middleware `keycloak.middleware.js`
- Create wrapper middleware that tries Keycloak first, falls back to legacy JWT
- Add user mapping logic (Keycloak UUID -> local user ID)
- Add `keycloak_id` column to `users` table
- Feature flag: `AUTH_PROVIDER` env var

**Files affected**:
- `backend/package.json` (new dependency)
- `backend/src/middleware/keycloak.middleware.js` (new)
- `backend/src/middleware/auth.middleware.js` (wrap with dual-auth logic)
- `backend/src/database/connection.js` (migration for `keycloak_id` column)
- `docs/keycloak-auth-step-2.md`

**Existing auth remains fully functional.**

### Step 3: Frontend — OIDC Integration

**What changes**:
- Install `keycloak-js` adapter
- Create Keycloak initialization module
- Update `authStore.js` to support Keycloak tokens
- Update Login/Signup pages with Keycloak redirect option
- Update Axios client to use Keycloak tokens when available
- Feature flag: `VITE_AUTH_PROVIDER` env var

**Files affected**:
- `frontend/package.json` (new dependency)
- `frontend/src/store/authStore.js` (dual auth support)
- `frontend/src/api/client.js` (dual token attachment)
- `frontend/src/pages/Login/index.jsx` (Keycloak login button)
- `frontend/src/pages/Signup/index.jsx` (Keycloak signup link)
- `frontend/src/App.jsx` (Keycloak initialization)
- `docs/keycloak-auth-step-3.md`

**Existing login form remains functional.**

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Keycloak downtime breaks auth | High | Parallel auth with fallback to legacy JWT |
| User ID mismatch (UUID vs integer) | Critical | Mapping column `keycloak_id` on `users` table; never replace `users.id` |
| Token format incompatibility | Medium | JWKS-based validation, not hardcoded secret |
| Frontend redirect loop | Medium | Feature flag to disable Keycloak redirect |
| Existing API keys break | High | API key auth is NOT changed — completely separate path |
| Prometheus scraping breaks | High | `/metrics` endpoint remains public — not in auth scope |
| Docker resource increase | Low | Keycloak + its DB adds ~512MB RAM; documented in requirements |
| Existing users lose access | Critical | User migration script + parallel auth period |

---

## 8. Rollback Strategy

At every step, rollback is possible by:

1. **Step 1** (Infrastructure): Remove Keycloak containers from docker-compose. Zero code impact.
2. **Step 2** (Backend): Set `AUTH_PROVIDER=legacy` env var. Keycloak middleware is bypassed. No code changes needed.
3. **Step 3** (Frontend): Set `VITE_AUTH_PROVIDER=legacy` env var. Frontend uses existing login form. No code changes needed.

**Emergency rollback**: Revert to the commit before migration changes. All existing auth code is preserved until explicit removal is approved.

---

## Appendix A: Files Inventory (Auth-Related)

### Backend
| File | Role |
|------|------|
| `backend/index.js` | Express app setup, route mounting, CORS config |
| `backend/src/middleware/auth.middleware.js` | JWT `authenticate` + API key `authenticateApiKey` |
| `backend/src/middleware/errorHandler.js` | `UnauthorizedError` class, error handler |
| `backend/src/middleware/rateLimiter.js` | `authLimiter`, `apiLimiter`, `metricsLimiter` |
| `backend/src/routes/auth.routes.js` | Signup, signin, refresh, password-reset routes |
| `backend/src/routes/apikey.routes.js` | API key CRUD (uses `authenticate`) |
| `backend/src/routes/metricconfig.routes.js` | Metric config CRUD (uses `authenticate`) |
| `backend/src/routes/metrics.routes.js` | Metrics ingestion (uses `authenticateApiKey`) |
| `backend/src/routes/codeGeneration.routes.js` | Code gen (uses `authenticate`) |
| `backend/src/routes/tracker.routes.js` | Tracker.js serving (uses API key query param) |
| `backend/src/routes/health.routes.js` | Health check (public) |
| `backend/src/database/connection.js` | DB pool, migrations (users, refresh_tokens tables) |

### Frontend
| File | Role |
|------|------|
| `frontend/src/App.jsx` | `PrivateRoute` component, route definitions |
| `frontend/src/store/authStore.js` | Zustand auth state (user, tokens, isAuthenticated) |
| `frontend/src/api/client.js` | Axios instance with auth interceptors |
| `frontend/src/api/auth.js` | `authAPI.signup()`, `authAPI.signin()` |
| `frontend/src/pages/Login/index.jsx` | Login form UI |
| `frontend/src/pages/Signup/index.jsx` | Signup form UI |

### Infrastructure
| File | Role |
|------|------|
| `docker/docker-compose.yml` | Service definitions (backend, prometheus, grafana) |
| `docker/prometheus/prometheus.yml` | Prometheus scrape config |
| `docker/.env` | Environment variables (JWT_SECRET, DB creds, etc.) |

---

## Appendix B: Environment Variables (Auth-Related)

| Variable | Default | Used In | Purpose |
|----------|---------|---------|---------|
| `JWT_SECRET` | `your-secret-key-change-in-production` | auth.routes.js, auth.middleware.js | JWT signing key |
| `JWT_ACCESS_EXPIRY` | `15m` | auth.routes.js | Access token TTL |
| `JWT_REFRESH_EXPIRY` | `7d` | auth.routes.js | Refresh token TTL |
| `FRONTEND_URL` | `http://localhost:5173` | index.js (CORS) | Allowed origin |
| `VITE_API_BASE_URL` | `http://localhost:3000` | frontend client.js | Backend URL |

### New Variables (To Be Added)
| Variable | Purpose |
|----------|---------|
| `AUTH_PROVIDER` | `legacy` / `keycloak` / `both` — controls active auth method |
| `KEYCLOAK_URL` | Keycloak server URL |
| `KEYCLOAK_REALM` | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | Backend OIDC client ID |
| `KEYCLOAK_CLIENT_SECRET` | Backend OIDC client secret |
| `VITE_AUTH_PROVIDER` | Frontend auth provider flag |
| `VITE_KEYCLOAK_URL` | Frontend Keycloak URL |
| `VITE_KEYCLOAK_REALM` | Frontend Keycloak realm |
| `VITE_KEYCLOAK_CLIENT_ID` | Frontend OIDC client ID |

---

## Appendix C: Verification Checklist (Phase 0)

- [x] Current login flow documented
- [x] Session handling documented
- [x] Password storage mechanism documented
- [x] All middleware/guards identified
- [x] All token types and usage documented
- [x] All auth entry points cataloged
- [x] All auth dependencies listed
- [x] Database schema (auth tables) documented
- [x] Backend framework and structure analyzed
- [x] Frontend framework and structure analyzed
- [x] Auth boundaries mapped (public / JWT / API key zones)
- [x] API structure documented
- [x] Deployment model documented
- [x] Auth enforcement points identified
- [x] External client impact assessed (API keys, Prometheus — no impact)
- [x] Service-to-service auth assessed (none exists)
- [x] Monitoring impact assessed (no impact on /metrics)
- [x] User ID mapping constraint identified (integer FK vs Keycloak UUID)
- [x] Migration strategy defined (5 steps with parallel auth)
- [x] Risk assessment completed
- [x] Rollback strategy defined
