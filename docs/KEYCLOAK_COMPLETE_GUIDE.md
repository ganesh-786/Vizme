# Complete Keycloak Integration Guide for MVP

This guide provides step-by-step instructions to configure Keycloak, integrate it with your Node.js backend and React frontend, track login records in PostgreSQL, and debug common issues.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Keycloak Configuration](#keycloak-configuration)
3. [Backend Integration](#backend-integration)
4. [Frontend Integration](#frontend-integration)
5. [Login Records Tracking](#login-records-tracking)
6. [Environment Variables Setup](#environment-variables-setup)
7. [Debugging App Hanging Issues](#debugging-app-hanging-issues)
8. [Verification Checklist](#verification-checklist)
9. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)

---

## Prerequisites

### 1. Verify Keycloak Installation

```bash
# Check if Keycloak is running
curl http://localhost:8081

# Or check the process
ps aux | grep keycloak

# Check if port 8081 is listening
sudo netstat -tlnp | grep 8081
# OR
sudo ss -tlnp | grep 8081
```

**Expected Output:** Keycloak welcome page or process running on port 8081

**If Keycloak is not running:**
```bash
# Start Keycloak (adjust path based on your installation)
# If installed via package manager:
sudo systemctl start keycloak
# OR if running standalone:
cd /path/to/keycloak/bin
./standalone.sh
```

### 2. Verify PostgreSQL is Running

```bash
# Check Docker containers
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/docker
docker compose ps

# Test PostgreSQL connection
docker exec -it metrics_postgres psql -U postgres -d metrics_db -c "SELECT version();"
```

### 3. Verify Backend and Frontend Dependencies

```bash
# Backend dependencies
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/backend
npm list jwks-rsa jsonwebtoken

# Frontend dependencies
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/frontend
npm list keycloak-js
```

---

## Keycloak Configuration

### Step 1: Access Keycloak Admin Console

1. Open browser: `http://localhost:8081`
2. Click **Administration Console**
3. Login with admin credentials (default: `admin` / `admin`)

### Step 2: Create a Realm

1. In top-left corner, click realm dropdown (shows "Master")
2. Click **Create Realm**
3. Enter realm name: `metrics-platform`
4. Click **Create**

**Important:** Realm name must match `KEYCLOAK_REALM` in your environment variables.

### Step 3: Create a Client

1. In left sidebar, click **Clients**
2. Click **Create client**
3. Fill in:
   - **Client type**: `OpenID Connect`
   - **Client ID**: `unified-visibility-platform`
   - Click **Next**

4. On **Capability config** page:
   - **Client authentication**: `OFF` (public client)
   - **Authorization**: `OFF`
   - **Standard flow**: `ON` ✅
   - **Direct access grants**: `ON` ✅ (optional, for testing)
   - **Implicit flow**: `OFF`
   - **Service accounts roles**: `OFF`
   - Click **Next**

5. On **Login settings** page:
   - **Root URL**: `http://localhost:5173`
   - **Home URL**: `http://localhost:5173`
   - **Valid redirect URIs**: 
     ```
     http://localhost:5173/*
     http://localhost:3000/*
     ```
   - **Valid post logout redirect URIs**: 
     ```
     http://localhost:5173/*
     http://localhost:3000/*
     ```
   - **Web origins**: 
     ```
     http://localhost:5173
     http://localhost:3000
     ```
   - Click **Save**

### Step 4: Configure Client Advanced Settings

1. Go to **Clients** → `unified-visibility-platform`
2. Go to **Settings** tab
3. Scroll to **Advanced settings**:
   - **Access token lifespan**: `5 Minutes` (default)
   - **SSO session idle**: `30 Minutes`
   - **SSO session max**: `10 Hours`
   - **Access token lifespan for implicit flow**: `15 Minutes`
   - Click **Save**

### Step 5: Create a Test User

1. In left sidebar, click **Users**
2. Click **Create new user**
3. Fill in:
   - **Username**: `testuser`
   - **Email**: `test@example.com`
   - **First name**: `Test`
   - **Last name**: `User`
   - **Email verified**: `ON` ✅
   - Click **Create**

4. Go to **Credentials** tab
5. Click **Set password**
6. Enter password (e.g., `Test123!`)
7. **Temporary**: `OFF` ✅
8. Click **Save**

### Step 6: Get Keycloak Configuration Details

After configuration, note these values (you'll need them for environment variables):

- **Keycloak URL**: `http://localhost:8081`
- **Realm**: `metrics-platform`
- **Client ID**: `unified-visibility-platform`

**To verify these values:**
1. Go to **Clients** → `unified-visibility-platform` → **Settings**
2. Check **Client ID** field
3. Check realm name in top-left dropdown
4. Check Keycloak URL in browser address bar

---

## Backend Integration

### Step 1: Verify Backend Dependencies

```bash
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/backend

# Check if jwks-rsa is installed
npm list jwks-rsa

# If not installed:
npm install jwks-rsa
```

### Step 2: Set Backend Environment Variables

Create or update `.env` file in `backend/` directory:

```bash
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/backend
nano .env
```

Add these variables:

```env
# Keycloak Configuration
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_REALM=metrics-platform
KEYCLOAK_CLIENT_ID=unified-visibility-platform

# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_NAME=metrics_db
DB_USER=postgres
DB_PASSWORD=postgres

# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
API_BASE_URL=http://localhost:3000

# JWT (optional, for legacy support)
JWT_SECRET=change-this-secret-in-production
```

**Important:** 
- Replace `KEYCLOAK_URL`, `KEYCLOAK_REALM`, and `KEYCLOAK_CLIENT_ID` with your actual values
- If using Docker, these are set in `docker-compose.yml`

### Step 3: Verify Backend Keycloak Middleware

The backend should already have `backend/src/middleware/keycloak.middleware.js` with:
- `verifyKeycloakToken()` - Verifies JWT tokens from Keycloak
- `syncUserFromKeycloak()` - Syncs user data to PostgreSQL
- `recordLogin()` - Records login in `login_records` table
- `authenticate()` - Express middleware for protected routes

**Verify the file exists:**
```bash
ls -la backend/src/middleware/keycloak.middleware.js
```

### Step 4: Verify Database Migration

The `login_records` table should be created automatically on backend startup.

**To manually verify:**
```bash
docker exec -it metrics_postgres psql -U postgres -d metrics_db -c "\d login_records"
```

**Expected output:**
```
                                    Table "public.login_records"
      Column      |            Type             | Collation | Nullable |      Default
------------------+-----------------------------+-----------+----------+------------------
 id               | integer                     |           | not null | nextval('login_records_id_seq'::regclass)
 user_id          | integer                     |           | not null |
 keycloak_id      | character varying(255)      |           |          |
 email            | character varying(255)       |           | not null |
 login_timestamp  | timestamp without time zone |           |          | CURRENT_TIMESTAMP
 logout_timestamp | timestamp without time zone |           |          |
 ip_address       | character varying(45)       |           |          |
 user_agent       | text                        |           |          |
 login_status     | character varying(20)       |           |          | 'success'::character varying
 session_duration | integer                     |           |          |
 created_at       | timestamp without time zone |           |          | CURRENT_TIMESTAMP
```

### Step 5: Test Backend Keycloak Integration

```bash
# Start backend (if not running)
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/docker
docker compose up -d backend

# Check backend logs
docker compose logs -f backend

# Test health endpoint
curl http://localhost:3000/health
```

**Expected output:**
```json
{"success":true,"status":"healthy","timestamp":"...","uptime":...}
```

---

## Frontend Integration

### Step 1: Verify Frontend Dependencies

```bash
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/frontend

# Check if keycloak-js is installed
npm list keycloak-js

# If not installed:
npm install keycloak-js
```

### Step 2: Set Frontend Environment Variables

Create `.env` file in `frontend/` directory:

```bash
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/frontend
nano .env
```

Add these variables:

```env
# Keycloak Configuration
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=metrics-platform
VITE_KEYCLOAK_CLIENT_ID=unified-visibility-platform

# API Configuration
VITE_API_BASE_URL=http://localhost:3000
VITE_GRAFANA_URL=http://localhost:3001
```

**Important:** 
- Vite requires `VITE_` prefix for environment variables
- Replace values with your actual Keycloak configuration

### Step 3: Verify Frontend Keycloak Service

The frontend should have `frontend/src/services/keycloak.js` with:
- `initKeycloak()` - Initializes Keycloak (singleton pattern)
- `login()` - Redirects to Keycloak login
- `logout()` - Logs out from Keycloak
- `getToken()` - Gets current access token
- `isAuthenticated()` - Checks authentication status

**Verify the file exists:**
```bash
ls -la frontend/src/services/keycloak.js
```

### Step 4: Verify Frontend Authentication Flow

The frontend should:
1. Initialize Keycloak on app start (`App.jsx`)
2. Handle OAuth callback redirects
3. Sync user with backend after authentication
4. Store token in Zustand store

**Verify App.jsx has Keycloak initialization:**
```bash
grep -n "initKeycloak" frontend/src/App.jsx
```

### Step 5: Test Frontend

```bash
# Start frontend (if not running)
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/frontend
npm run dev

# Open browser
# http://localhost:5173
```

---

## Login Records Tracking

### How It Works

1. **On Login:**
   - User authenticates via Keycloak
   - Frontend sends token to `/api/v1/auth/callback`
   - Backend verifies token, syncs user, and records login in `login_records` table

2. **On Logout:**
   - User clicks logout
   - Frontend calls `/api/v1/auth/logout`
   - Backend updates `login_records` with `logout_timestamp` and `session_duration`

3. **Viewing Login History:**
   - Call `GET /api/v1/auth/login-history` with Bearer token
   - Returns last 50 login records for the user

### Database Schema

The `login_records` table stores:
- `user_id` - Foreign key to `users` table
- `keycloak_id` - Keycloak user ID
- `email` - User email
- `login_timestamp` - When user logged in
- `logout_timestamp` - When user logged out (NULL if still logged in)
- `ip_address` - User's IP address
- `user_agent` - Browser user agent
- `login_status` - 'success', 'failed', or 'expired'
- `session_duration` - Duration in seconds (calculated on logout)

### Querying Login Records

```bash
# Connect to PostgreSQL
docker exec -it metrics_postgres psql -U postgres -d metrics_db

# View all login records
SELECT * FROM login_records ORDER BY login_timestamp DESC LIMIT 10;

# View login records for a specific user
SELECT * FROM login_records WHERE email = 'test@example.com' ORDER BY login_timestamp DESC;

# View active sessions (no logout timestamp)
SELECT * FROM login_records WHERE logout_timestamp IS NULL;

# View login statistics
SELECT 
  email,
  COUNT(*) as total_logins,
  MAX(login_timestamp) as last_login,
  AVG(session_duration) as avg_session_duration
FROM login_records
GROUP BY email
ORDER BY last_login DESC;
```

### API Endpoint for Login History

**Endpoint:** `GET /api/v1/auth/login-history`

**Headers:**
```
Authorization: Bearer <keycloak_access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "loginHistory": [
      {
        "id": 1,
        "login_timestamp": "2024-01-15T10:30:00.000Z",
        "logout_timestamp": "2024-01-15T11:45:00.000Z",
        "ip_address": "192.168.1.100",
        "user_agent": "Mozilla/5.0...",
        "login_status": "success",
        "session_duration": 4500
      }
    ]
  }
}
```

---

## Environment Variables Setup

### Backend Environment Variables

**File:** `backend/.env` (or in `docker-compose.yml`)

```env
# Keycloak
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_REALM=metrics-platform
KEYCLOAK_CLIENT_ID=unified-visibility-platform

# Database
DB_HOST=localhost
DB_PORT=5433
DB_NAME=metrics_db
DB_USER=postgres
DB_PASSWORD=postgres

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
API_BASE_URL=http://localhost:3000
```

### Frontend Environment Variables

**File:** `frontend/.env`

```env
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=metrics-platform
VITE_KEYCLOAK_CLIENT_ID=unified-visibility-platform
VITE_API_BASE_URL=http://localhost:3000
VITE_GRAFANA_URL=http://localhost:3001
```

### Docker Compose Environment Variables

**File:** `docker/docker-compose.yml`

The backend service already has Keycloak environment variables:
```yaml
environment:
  - KEYCLOAK_URL=http://localhost:8081
  - KEYCLOAK_REALM=metrics-platform
  - KEYCLOAK_CLIENT_ID=unified-visibility-platform
```

**Important:** If Keycloak is running on the host (not in Docker), use `http://localhost:8081`. If Keycloak is in Docker, use the service name or host IP.

---

## Debugging App Hanging Issues

### Common Causes and Solutions

#### 1. Keycloak Not Accessible

**Symptoms:**
- App hangs on "Loading..."
- Console shows: `Keycloak initialization failed`
- Network tab shows failed requests to Keycloak

**Solution:**
```bash
# Check if Keycloak is running
curl http://localhost:8081

# Check Keycloak logs
# If running as service:
sudo journalctl -u keycloak -f
# If running standalone:
tail -f /path/to/keycloak/standalone/log/server.log

# Verify Keycloak URL in environment variables
echo $KEYCLOAK_URL  # Backend
# Or check frontend .env file
cat frontend/.env | grep KEYCLOAK
```

#### 2. Incorrect Keycloak Configuration

**Symptoms:**
- App redirects to Keycloak but fails to authenticate
- Console shows: `Invalid token` or `Token verification failed`

**Solution:**
1. Verify realm name matches in Keycloak and environment variables
2. Verify client ID matches
3. Check redirect URIs in Keycloak client settings
4. Verify Web origins includes frontend URL

**Check Keycloak client settings:**
```
Keycloak Admin Console → Clients → unified-visibility-platform → Settings
```

#### 3. CORS Issues

**Symptoms:**
- Browser console shows CORS errors
- Network requests fail with CORS preflight errors

**Solution:**
1. Verify `FRONTEND_URL` in backend matches actual frontend URL
2. Check backend CORS configuration in `backend/index.js`
3. Verify Keycloak Web origins includes frontend URL

#### 4. Database Connection Issues

**Symptoms:**
- Backend fails to start
- Database queries fail
- Login records not being saved

**Solution:**
```bash
# Check PostgreSQL is running
docker compose ps postgres

# Test database connection
docker exec -it metrics_postgres psql -U postgres -d metrics_db -c "SELECT NOW();"

# Check backend database configuration
docker compose logs backend | grep -i "database\|postgres"
```

#### 5. Token Refresh Loop

**Symptoms:**
- App flickers between login and dashboard
- Console shows repeated token refresh attempts
- Network tab shows multiple 401 responses

**Solution:**
This is already fixed in the current implementation with:
- `authReady` flag to block API calls until auth is ready
- Global token refresh lock to prevent concurrent refreshes
- Proper dependency arrays in React `useEffect` hooks

**If still occurring:**
1. Clear browser localStorage: `localStorage.clear()`
2. Clear browser cookies for Keycloak
3. Restart backend and frontend

#### 6. React StrictMode Double Invocation

**Symptoms:**
- Keycloak initializes twice
- Multiple API calls on page load

**Solution:**
Already fixed with `useRef` guard in `App.jsx`:
```javascript
const initRef = useRef(false);
if (initRef.current) return;
initRef.current = true;
```

### Debugging Steps

1. **Check Browser Console:**
   - Open DevTools (F12)
   - Look for errors in Console tab
   - Check Network tab for failed requests

2. **Check Backend Logs:**
   ```bash
   docker compose logs -f backend
   ```

3. **Check Keycloak Logs:**
   ```bash
   # If running as service:
   sudo journalctl -u keycloak -f
   # If running standalone:
   tail -f /path/to/keycloak/standalone/log/server.log
   ```

4. **Test Keycloak Directly:**
   ```bash
   # Test Keycloak health
   curl http://localhost:8081/health
   
   # Test realm endpoint
   curl http://localhost:8081/realms/metrics-platform
   ```

5. **Test Backend Endpoints:**
   ```bash
   # Health check
   curl http://localhost:3000/health
   
   # Test with token (get token from browser localStorage after login)
   curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/auth/me
   ```

---

## Verification Checklist

### ✅ Keycloak Configuration

- [ ] Keycloak is running on `http://localhost:8081`
- [ ] Can access Keycloak Admin Console
- [ ] Realm `metrics-platform` exists
- [ ] Client `unified-visibility-platform` exists
- [ ] Client has correct redirect URIs:
  - [ ] `http://localhost:5173/*`
  - [ ] `http://localhost:3000/*`
- [ ] Client has correct Web origins:
  - [ ] `http://localhost:5173`
  - [ ] `http://localhost:3000`
- [ ] Test user exists and can log in via Keycloak

### ✅ Backend Configuration

- [ ] Backend is running on `http://localhost:3000`
- [ ] Backend health endpoint returns success: `curl http://localhost:3000/health`
- [ ] Environment variables are set correctly:
  - [ ] `KEYCLOAK_URL=http://localhost:8081`
  - [ ] `KEYCLOAK_REALM=metrics-platform`
  - [ ] `KEYCLOAK_CLIENT_ID=unified-visibility-platform`
- [ ] `jwks-rsa` package is installed: `npm list jwks-rsa`
- [ ] `login_records` table exists in database
- [ ] Backend can connect to PostgreSQL

### ✅ Frontend Configuration

- [ ] Frontend is running on `http://localhost:5173`
- [ ] Environment variables are set correctly:
  - [ ] `VITE_KEYCLOAK_URL=http://localhost:8081`
  - [ ] `VITE_KEYCLOAK_REALM=metrics-platform`
  - [ ] `VITE_KEYCLOAK_CLIENT_ID=unified-visibility-platform`
- [ ] `keycloak-js` package is installed: `npm list keycloak-js`
- [ ] Frontend can access Keycloak (no CORS errors)

### ✅ Authentication Flow

- [ ] Clicking "Sign In" redirects to Keycloak
- [ ] After login, redirects back to app
- [ ] Dashboard loads after successful login
- [ ] User information is displayed correctly
- [ ] Token is stored in Zustand store (check localStorage)
- [ ] API calls include Bearer token in headers

### ✅ Login Records Tracking

- [ ] Login is recorded in `login_records` table after login
- [ ] Logout updates `logout_timestamp` in `login_records`
- [ ] `session_duration` is calculated correctly
- [ ] Login history API endpoint returns data: `GET /api/v1/auth/login-history`

### ✅ Logout Flow

- [ ] Clicking "Logout" redirects to Keycloak logout
- [ ] After logout, redirects to login page
- [ ] Token is cleared from store
- [ ] Cannot access protected routes after logout

### ✅ Error Handling

- [ ] Invalid tokens are rejected with 401
- [ ] Expired tokens trigger refresh (if refresh token available)
- [ ] Network errors are handled gracefully
- [ ] Keycloak unavailable errors don't crash the app

---

## Common Pitfalls and Solutions

### Pitfall 1: Wrong Keycloak URL

**Problem:** Backend can't verify tokens because Keycloak URL is incorrect.

**Solution:**
- Verify Keycloak is accessible: `curl http://localhost:8081`
- Check environment variables match actual Keycloak URL
- If Keycloak is in Docker, use service name or host IP

### Pitfall 2: Mismatched Realm/Client ID

**Problem:** Tokens fail verification because realm or client ID doesn't match.

**Solution:**
- Verify realm name in Keycloak Admin Console
- Verify client ID in Keycloak client settings
- Ensure environment variables match exactly (case-sensitive)

### Pitfall 3: CORS Errors

**Problem:** Browser blocks requests due to CORS policy.

**Solution:**
- Add frontend URL to Keycloak Web origins
- Verify `FRONTEND_URL` in backend matches actual frontend URL
- Check backend CORS configuration allows frontend origin

### Pitfall 4: Redirect URI Mismatch

**Problem:** Keycloak rejects redirect because URI doesn't match.

**Solution:**
- Add exact redirect URI to Keycloak client settings
- Use wildcard: `http://localhost:5173/*`
- Ensure protocol (http/https) matches

### Pitfall 5: Token Expiration

**Problem:** Tokens expire quickly, causing frequent re-authentication.

**Solution:**
- Increase token lifespan in Keycloak client settings
- Implement token refresh in frontend (already done)
- Check `updateToken()` is called before token expires

### Pitfall 6: Database Connection from Backend Container

**Problem:** Backend in Docker can't connect to Keycloak on host.

**Solution:**
- Use `host.docker.internal` instead of `localhost` (Docker Desktop)
- Or use host IP address
- Or run Keycloak in Docker on same network

### Pitfall 7: React StrictMode Double Initialization

**Problem:** Keycloak initializes twice in development.

**Solution:**
- Already fixed with `useRef` guard
- If still occurring, check `App.jsx` has the guard

### Pitfall 8: Login Records Not Being Saved

**Problem:** Login records table is empty after login.

**Solution:**
- Verify `login_records` table exists: `\d login_records`
- Check backend logs for errors
- Verify `recordLogin()` is called in auth callback
- Check database connection is working

---

## Quick Reference: Keycloak URLs

Replace `<KEYCLOAK_URL>` with your actual Keycloak URL (e.g., `http://localhost:8081`)

- **Admin Console**: `<KEYCLOAK_URL>`
- **Realm Endpoint**: `<KEYCLOAK_URL>/realms/<REALM_NAME>`
- **JWKS Endpoint**: `<KEYCLOAK_URL>/realms/<REALM_NAME>/protocol/openid-connect/certs`
- **Token Endpoint**: `<KEYCLOAK_URL>/realms/<REALM_NAME>/protocol/openid-connect/token`
- **Authorization Endpoint**: `<KEYCLOAK_URL>/realms/<REALM_NAME>/protocol/openid-connect/auth`
- **User Info Endpoint**: `<KEYCLOAK_URL>/realms/<REALM_NAME>/protocol/openid-connect/userinfo`

---

## Support and Troubleshooting

If you encounter issues:

1. **Check Logs:**
   - Backend: `docker compose logs -f backend`
   - Keycloak: `sudo journalctl -u keycloak -f` or check standalone logs
   - Browser: Open DevTools Console and Network tabs

2. **Verify Configuration:**
   - All environment variables are set correctly
   - Keycloak realm and client match environment variables
   - Database is accessible and tables exist

3. **Test Endpoints:**
   - Keycloak: `curl http://localhost:8081/health`
   - Backend: `curl http://localhost:3000/health`
   - Database: `docker exec -it metrics_postgres psql -U postgres -d metrics_db -c "SELECT NOW();"`

4. **Common Fixes:**
   - Restart all services: `docker compose restart`
   - Clear browser cache and localStorage
   - Verify Keycloak is accessible from backend container
   - Check firewall rules for port 8081

---

## Next Steps

After completing this guide:

1. **Production Setup:**
   - Use HTTPS for Keycloak and application
   - Set strong admin password for Keycloak
   - Configure proper token lifespans
   - Set up database backups

2. **Security Hardening:**
   - Enable Keycloak security features
   - Configure rate limiting
   - Set up monitoring and alerting
   - Regular security audits

3. **Monitoring:**
   - Monitor login records for suspicious activity
   - Track failed login attempts
   - Monitor token refresh rates
   - Set up alerts for authentication failures

---

**Last Updated:** 2024-01-15
**Version:** 1.0
