# Keycloak Quick Start Guide

## Quick Setup Checklist

### 1. Keycloak Configuration (5 minutes)

1. **Access Keycloak Admin Console:**
   ```
   http://localhost:8081
   ```

2. **Create Realm:**
   - Click realm dropdown → Create Realm
   - Name: `metrics-platform`
   - Click Create

3. **Create Client:**
   - Clients → Create client
   - Client ID: `unified-visibility-platform`
   - Client type: `OpenID Connect`
   - Standard flow: ON
   - Valid redirect URIs: `http://localhost:5173/*`
   - Web origins: `http://localhost:5173`
   - Click Save

4. **Create Test User:**
   - Users → Create new user
   - Username: `testuser`
   - Email: `test@example.com`
   - Credentials tab → Set password
   - Temporary: OFF

### 2. Environment Variables

**Backend** (`backend/.env` or `docker/docker-compose.yml`):
```env
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_REALM=metrics-platform
KEYCLOAK_CLIENT_ID=unified-visibility-platform
```

**Frontend** (`frontend/.env`):
```env
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=metrics-platform
VITE_KEYCLOAK_CLIENT_ID=unified-visibility-platform
VITE_API_BASE_URL=http://localhost:3000
```

### 3. Verify Installation

```bash
# Check Keycloak
curl http://localhost:8081

# Check Backend
curl http://localhost:3000/health

# Check Database
docker exec -it metrics_postgres psql -U postgres -d metrics_db -c "\d login_records"
```

### 4. Test Login Flow

1. Open `http://localhost:5173`
2. Click "Sign In with Keycloak"
3. Login with test user credentials
4. Should redirect to dashboard

### 5. Verify Login Records

```bash
# View login records
docker exec -it metrics_postgres psql -U postgres -d metrics_db -c "SELECT * FROM login_records ORDER BY login_timestamp DESC LIMIT 5;"
```

## Common Issues

### App Hangs on Load

**Check:**
1. Keycloak is running: `curl http://localhost:8081`
2. Environment variables are set correctly
3. Browser console for errors
4. Backend logs: `docker compose logs -f backend`

### Authentication Fails

**Check:**
1. Realm name matches in Keycloak and env vars
2. Client ID matches
3. Redirect URIs include frontend URL
4. Web origins include frontend URL

### Login Records Not Saved

**Check:**
1. `login_records` table exists
2. Backend can connect to database
3. Check backend logs for errors

## Full Documentation

See `docs/KEYCLOAK_COMPLETE_GUIDE.md` for detailed instructions.
