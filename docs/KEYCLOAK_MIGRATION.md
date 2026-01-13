# Keycloak Integration - Migration Summary

## Overview

The authentication system has been migrated from JWT-based authentication to Keycloak (IdP) authentication. This provides enterprise-grade security with features like SSO, MFA support, and centralized user management.

## What Changed

### Backend Changes

1. **New Dependencies**
   - `jwks-rsa`: For fetching and caching Keycloak's public keys
   - `axios`: Already present, used for Keycloak communication

2. **New Files**
   - `backend/src/middleware/keycloak.middleware.js`: Keycloak token verification and user sync middleware
   - Replaces `backend/src/middleware/auth.middleware.js` for user authentication

3. **Updated Files**
   - `backend/src/routes/auth.routes.js`: Simplified to handle Keycloak callback and user sync
   - `backend/src/routes/apiKey.routes.js`: Updated to use Keycloak middleware
   - `backend/src/routes/codeGeneration.routes.js`: Updated to use Keycloak middleware
   - `backend/src/routes/metricconfig.routes.js`: Updated to use Keycloak middleware
   - `backend/src/routes/metrics.routes.js`: Updated to use Keycloak middleware
   - `backend/src/database/connection.js`: Added `keycloak_id` column to users table
   - `backend/index.js`: Updated imports to use Keycloak middleware
   - `docker/docker-compose.yml`: Added Keycloak environment variables

4. **Database Schema Changes**
   - Added `keycloak_id` column to `users` table
   - `password_hash` is now nullable (users authenticated via Keycloak don't need passwords)
   - Unique index on `keycloak_id`

### Frontend Changes

1. **New Dependencies**
   - `keycloak-js`: Official Keycloak JavaScript adapter

2. **New Files**
   - `frontend/src/services/keycloak.js`: Keycloak service wrapper
   - `frontend/public/silent-check-sso.html`: Silent SSO check page

3. **Updated Files**
   - `frontend/src/store/authStore.js`: Updated to work with Keycloak tokens
   - `frontend/src/api/auth.js`: Simplified to use Keycloak callback
   - `frontend/src/api/client.js`: Updated token handling for Keycloak
   - `frontend/src/pages/Login.jsx`: Now uses Keycloak login flow
   - `frontend/src/pages/Signup.jsx`: Now uses Keycloak registration flow
   - `frontend/src/components/Layout.jsx`: Updated logout to use Keycloak
   - `frontend/src/App.jsx`: Added Keycloak initialization

## What Remains the Same

- All API endpoints remain unchanged
- Database structure (except for added `keycloak_id` column)
- API key authentication (still works the same way)
- All business logic and routes
- Frontend routing and components (except auth pages)

## Keycloak Configuration Required

You need to provide the following information from your Keycloak installation:

### 1. Keycloak URL
- **What it is**: The base URL where Keycloak is running
- **Example**: `http://localhost:8080`
- **How to get it**: 
  - Open your Keycloak admin console
  - The URL in your browser is your Keycloak URL
  - Default: `http://localhost:8080`

### 2. Realm Name
- **What it is**: A realm in Keycloak is like a tenant/namespace
- **Example**: `unified-visibility-platform` or `master`
- **How to get it**:
  - In Keycloak Admin Console, look at the top-left dropdown
  - The selected realm name is what you need
  - You can use `master` (default) or create a new realm

### 3. Client ID
- **What it is**: The identifier for your application in Keycloak
- **Example**: `unified-visibility-platform`
- **How to get it**:
  - Go to Keycloak Admin Console → Clients
  - Create a new client or use an existing one
  - The Client ID is shown in the client settings

### Step-by-Step: Getting Keycloak Information

1. **Start Keycloak** (if not already running)
   ```bash
   # If using Docker:
   docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev
   
   # Or if installed locally, start your Keycloak server
   ```

2. **Access Admin Console**
   - Open browser: `http://localhost:8080` (or your Keycloak URL)
   - Click "Administration Console"
   - Login with admin credentials

3. **Create/Select Realm**
   - Click realm dropdown (top-left, usually shows "Master")
   - Either use "master" or create a new realm
   - Note the realm name

4. **Create Client**
   - Go to "Clients" in left sidebar
   - Click "Create client"
   - Client ID: `unified-visibility-platform`
   - Client type: OpenID Connect
   - Click "Next"
   - Enable "Standard flow"
   - Click "Next"
   - Valid redirect URIs: `http://localhost:5173/*`
   - Web origins: `http://localhost:5173`
   - Click "Save"
   - Note the Client ID

5. **Get Your Information**
   - **Keycloak URL**: Your Keycloak server URL (e.g., `http://localhost:8080`)
   - **Realm Name**: The realm you're using (from step 3)
   - **Client ID**: The client you created (from step 4)

## Environment Variables Setup

### Backend (.env or docker-compose.yml)

Add these to your `docker/docker-compose.yml` backend service:

```yaml
environment:
  - KEYCLOAK_URL=http://localhost:8080
  - KEYCLOAK_REALM=unified-visibility-platform
  - KEYCLOAK_CLIENT_ID=unified-visibility-platform
```

Or create a `.env` file in the backend directory:

```env
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=unified-visibility-platform
KEYCLOAK_CLIENT_ID=unified-visibility-platform
```

### Frontend (.env)

Create a `.env` file in the `frontend` directory:

```env
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=unified-visibility-platform
VITE_KEYCLOAK_CLIENT_ID=unified-visibility-platform
```

## Testing the Integration

1. **Start Services**
   ```bash
   cd docker
   docker compose up -d
   ```

2. **Start Frontend**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Test Login**
   - Navigate to `http://localhost:5173/login`
   - Click "Sign In with Keycloak"
   - You should be redirected to Keycloak login page
   - After login, you'll be redirected back to the app

4. **Verify User Sync**
   - Check your PostgreSQL database
   - The `users` table should have a new entry with `keycloak_id` populated

## Migration Notes

- **Existing Users**: Users created before Keycloak integration will need to log in via Keycloak once to link their account
- **Password Migration**: Passwords are no longer stored/used for Keycloak-authenticated users
- **API Keys**: Still work the same way and are independent of Keycloak authentication

## Troubleshooting

See `KEYCLOAK_SETUP.md` for detailed troubleshooting guide.

## Next Steps

1. Configure Keycloak with the information above
2. Set environment variables
3. Restart services
4. Test authentication flow

For detailed Keycloak setup instructions, see `docs/KEYCLOAK_SETUP.md`.

