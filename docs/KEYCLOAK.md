# Keycloak Authentication

The backend uses **Keycloak** for authentication. Login and signup (user registration) happen in Keycloak; the backend validates Keycloak-issued access tokens and links them to app users in PostgreSQL.

## Required Environment Variables

In `docker/.env` (used by backend and Keycloak containers):

| Variable | Required | Description |
|----------|----------|-------------|
| `KEYCLOAK_ISSUER_URI` | Yes | Full realm issuer URL for JWT validation and token exchange (backend fetches JWKS and calls token endpoint here). From Docker backend use `http://host.docker.internal:8180/realms/<realm>` when Keycloak is on host. |
| `KEYCLOAK_PUBLIC_URL` | No (default: http://localhost:8180) | URL the **browser** uses to reach Keycloak (login/register). Must match Keycloak host/port (e.g. http://localhost:8180). |
| `KEYCLOAK_REALM` | No (default: metrics) | Realm name; used with KEYCLOAK_PUBLIC_URL for frontend redirect URLs. |
| `KEYCLOAK_CLIENT_ID` | No (default: metrics-client) | Keycloak client ID; used in login/register URLs and token exchange. |
| `KEYCLOAK_CLIENT_SECRET` | No | Client secret (only if client is confidential). Required for token exchange when client authentication is ON. |
| `KEYCLOAK_AUDIENCE` | No | Token audience; if unset, backend accepts `KEYCLOAK_CLIENT_ID` or `account` in token `aud` claim. |
| `KEYCLOAK_ADMIN` | No | Keycloak admin username (default: admin). |
| `KEYCLOAK_ADMIN_PASSWORD` | No | Keycloak admin password (default: admin). |
| `FRONTEND_URL` | No | Frontend base URL for redirect_uri (default: http://localhost:5173). Must match Valid redirect URIs in Keycloak (e.g. `http://localhost:5173/callback`). |

## Keycloak Configuration

1. **Create a realm** (e.g. `metrics`).
2. **Create a client** (e.g. `metrics-client`):
   - Client authentication: ON if you use a client secret (backend can validate with audience).
   - Authorization: OFF unless you use Keycloak authorization.
   - Valid redirect URIs: `http://localhost:5173/*` (or your frontend URL + `/callback`).
   - Web origins: `http://localhost:5173` (or your frontend origin).
3. **Enable registration** (optional): Realm settings → Login → User registration ON.
4. **Token issuer**: The issuer in access tokens must match `KEYCLOAK_ISSUER_URI`. When users log in via the browser at `http://localhost:8180`, Keycloak sets the token issuer from the request host. So either:
   - Set `KEYCLOAK_ISSUER_URI=http://host.docker.internal:8180/realms/metrics` and ensure Keycloak is reachable at that URL from the backend container, or
   - Run Keycloak with a hostname that matches what the backend will use (e.g. same hostname for frontend and backend).

## Backend Auth Endpoints

- **GET /api/v1/auth/config** – Public; returns `{ loginUrl, registerUrl, logoutUrl, redirectUri, issuerUri, clientId }` for the frontend to redirect users to Keycloak.
- **POST /api/v1/auth/token** – Public; exchanges authorization code for tokens. Body: `{ code, redirect_uri }`. Returns `{ access_token, refresh_token }`. Used to avoid CORS (browser does not call Keycloak token endpoint directly).
- **GET /api/v1/auth/me** – Returns current user (requires `Authorization: Bearer <access_token>`). Use after login to get app user `{ id, email, name }`.

## Login Flow (Authorization Code)

1. User clicks "Sign in with Keycloak" → frontend calls **GET /api/v1/auth/config**, then redirects to `loginUrl`.
2. User logs in at Keycloak (no password sent to backend).
3. Keycloak redirects to `FRONTEND_URL/callback?code=...`.
4. Frontend calls **POST /api/v1/auth/token** with `{ code, redirect_uri: FRONTEND_URL/callback }`; backend exchanges with Keycloak and returns tokens.
5. Frontend stores tokens, calls **GET /api/v1/auth/me** with `Authorization: Bearer <access_token>`, then redirects to dashboard.
6. All subsequent API calls send `Authorization: Bearer <access_token>` (client interceptor).

## Signup Flow

1. User clicks "Sign up with Keycloak" → frontend calls **GET /api/v1/auth/config**, then redirects to `registerUrl` (Keycloak user registration page).
2. Enable **User registration** in Keycloak: Realm settings → Login → User registration ON.
3. After registration, Keycloak redirects to `/callback?code=...`; same token exchange and /me as login.

## Docker Networking

- Backend and Keycloak are on the same Docker network (`metrics_network`). From the backend container, Keycloak is reachable at `http://keycloak:8080`.
- If the frontend runs on the host and users log in at `http://localhost:8180`, tokens will have issuer `http://localhost:8180/realms/metrics`. The backend (in Docker) cannot reach `localhost:8180`. Set `KEYCLOAK_ISSUER_URI=http://host.docker.internal:8180/realms/metrics` so the backend fetches JWKS from the host (Docker Desktop / Linux with extra_hosts).

## Troubleshooting

### "Back to login after signing in at Keycloak"

1. **Valid redirect URIs**: In Keycloak Admin → your realm → Client `metrics-client` → **Valid redirect URIs** must include `http://localhost:5173/callback` (or your frontend URL + `/callback`). **Web origins** must include `http://localhost:5173`.
2. **Issuer match**: The token issuer (set by Keycloak from the login URL) must match `KEYCLOAK_ISSUER_URI`. When you log in at `http://localhost:8180`, the issuer is `http://localhost:8180/realms/<realm>`. So set `KEYCLOAK_ISSUER_URI=http://localhost:8180/realms/metrics`. If the backend runs in Docker, use `http://host.docker.internal:8180/realms/metrics` and set Keycloak hostname to `host.docker.internal`.
3. **Backend on host**: If the backend runs with `npm run dev` (on the host), it can reach `localhost:8180`; keep `KEYCLOAK_ISSUER_URI=http://localhost:8180/realms/metrics`.

### "Token exchange failed" or CORS on callback

- The frontend does **not** call Keycloak's token endpoint from the browser (CORS would block it). It calls **POST /api/v1/auth/token** on the backend; the backend exchanges the code with Keycloak. Ensure the backend can reach `KEYCLOAK_ISSUER_URI` (e.g. from Docker use `host.docker.internal`).

### "Invalid token" or "Invalid audience" on /me

- Backend accepts token `aud` equal to `KEYCLOAK_CLIENT_ID` or `account` by default. If your token has a different `aud`, set `KEYCLOAK_AUDIENCE` to that value (or add it in Keycloak Client → Advanced → Audience).
