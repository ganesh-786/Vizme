## Changes since last commit (modified files only)

_This document lists only files marked as **M** (modified) in `git status`, excluding untracked (`??`) files._

- **backend/index.js**
  - Logged the configured Keycloak issuer URL at startup.
  - Updated required environment variable validation to also enforce `KEYCLOAK_ISSUER_URI`.

- **backend/package.json**
  - Added `express-oauth2-jwt-bearer` dependency for Keycloak JWT validation.

- **backend/package-lock.json**
  - Locked versions for `express-oauth2-jwt-bearer` and its dependency `jose`, and adjusted some existing dependency metadata to match the updated dependency graph.

- **backend/src/database/connection.js**
  - Added lightweight migrations to support Keycloak:
    - New `keycloak_sub` column on `users` (unique identifier for Keycloak users).
    - Made `password_hash` optional to support passwordless, Keycloak-only accounts.

- **backend/src/middleware/auth.middleware.js**
  - Replaced custom JWT handling with `express-oauth2-jwt-bearer` validating Keycloak-issued tokens.
  - Introduced `resolveUserFromToken` to look up or create app users by `keycloak_sub` and attach `{ id, email, name }` on `req.user`.
  - Exported `authenticate` as a middleware chain (`[validateKeycloakJwt, resolveUserFromToken]`) and kept API key auth unchanged.

- **backend/src/middleware/errorHandler.js**
  - Broadened authentication error handling to treat Keycloak/OAuth2 JWT bearer errors (`status === 401` or `code === 'invalid_token'`) as 401 Unauthorized responses.

- **backend/src/routes/apikey.routes.js**
  - Updated route protection to use the new Keycloak-based `authenticate` middleware (spread as `...authenticate`).

- **backend/src/routes/auth.routes.js**
  - Replaced email/password-based auth with Keycloak-centric endpoints:
    - `GET /auth/me` now uses Keycloak JWT + `authenticate` to return the current user.
    - `GET /auth/config` returns Keycloak login, register, and logout URLs plus metadata (issuer, client, redirect URI).
    - `POST /auth/token` exchanges an authorization code for access/refresh tokens via Keycloak, enforcing expected `redirect_uri`.
  - Removed local signup, signin, refresh token, and password reset endpoints.

- **backend/src/routes/codeGeneration.routes.js**
  - Switched to Keycloak JWT authentication via the new `authenticate` middleware (`router.use(...authenticate)`).

- **backend/src/routes/metricconfig.routes.js**
  - Switched to Keycloak JWT authentication via the new `authenticate` middleware (`router.use(...authenticate)`).

- **backend/src/routes/metrics.routes.js**
  - Updated the metrics `GET /` route to spread the new `authenticate` middleware (`...authenticate`).

- **docker/docker-compose.yml**
  - Reworked Keycloak configuration:
    - Defaulted to `KC_DB=dev-file` so Keycloak can run without Postgres for local dev.
    - Added `KC_HOSTNAME`, `KC_HOSTNAME_PORT`, and `KC_PROXY` to make the portal work reliably at `http://localhost:8180`.
    - Increased `start_period` for the Keycloak healthcheck.
  - Updated backend service environment:
    - Introduced `KEYCLOAK_ISSUER_URI`, `KEYCLOAK_INTERNAL_ISSUER_URI`, `KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_AUDIENCE`, and `KEYCLOAK_CLIENT_ID` for Keycloak integration.
    - Added `extra_hosts` entry for `host.docker.internal` so the backend in Docker can reach services on the host if needed.

- **frontend/src/App.tsx**
  - Added a `Callback` route at `/callback` to handle Keycloak’s authorization-code redirect.
  - Introduced `RedirectCodeToCallback` to automatically route `?code=...` queries on `/` or `/login` to `/callback`.
  - Wrapped the main `Routes` with this redirect component.

- **frontend/src/api/auth.js**
  - Repurposed the auth API to be Keycloak-oriented:
    - Added `getConfig()` to load Keycloak login/register/logout URLs and auth metadata from the backend.
    - Added `exchangeCodeForTokens()` to call the backend’s `/auth/token` endpoint.
    - Added `getMe()` and `getMeWithToken()` helpers to fetch the current user with a bearer token.
  - Removed legacy email/password `signup` and `signin` helpers.

- **frontend/src/api/client.js**
  - Simplified the response interceptor:
    - On `401`, it now logs out via `useAuthStore` and redirects to `/login` instead of attempting refresh-token rotation.

- **frontend/src/components/Layout/index.jsx**
  - Injected `authAPI` and updated the avatar (“M” profile) button behavior:
    - On click, it clears local auth state, then tries to redirect the browser to the backend-provided Keycloak `logoutUrl` to fully log out.
    - Falls back to navigating to `/login` if fetching the config fails or no logout URL is available.

- **frontend/src/pages/Login/index.jsx**
  - Simplified the UI to a single “Sign in with Keycloak” button instead of email/password fields.
  - On submit, calls `authAPI.getConfig()` and redirects the browser to `config.loginUrl`.
  - Improved error handling for backend connectivity issues (e.g., backend not running).

- **frontend/src/pages/Signup/index.jsx**
  - Converted signup to Keycloak registration:
    - “Sign up with Keycloak” now fetches `config.registerUrl` and redirects there.
    - Added `useSearchParams` + `useEffect` logic so `/signup?then=register` automatically fetches config and jumps to the Keycloak registration page.
  - Simplified the form to a single “Sign up with Keycloak” CTA and removed local name/email/password fields.
  - Updated the legal text to reference “Sign up with Keycloak”.

- **frontend/src/store/authStore.js**
  - Extended the store with a `setTokens(accessToken, refreshToken)` helper to set tokens without an immediate user object (used in the Keycloak callback flow).
  - Persisted the new token-only updates to `localStorage` alongside existing auth state.

