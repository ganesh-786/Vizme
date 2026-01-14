# Keycloak Quick Setup Guide

After starting the Docker containers, you need to configure Keycloak for the first time.

## Step 1: Fix Database Setup (If Keycloak Fails to Start)

**If you see "password authentication failed for user keycloak" error:**

The PostgreSQL database and user need to be created. This happens automatically on first startup, but if the PostgreSQL volume already existed, you need to create them manually:

```bash
cd docker
./fix-keycloak-db.sh
```

**OR** if you want to start fresh (this will delete all data):

```bash
cd docker
docker compose down -v  # Remove volumes
docker compose up -d     # Start fresh
```

## Step 2: Start All Services

```bash
cd docker
docker compose up -d
```

Wait for Keycloak to be fully started (it may take 1-2 minutes). Check logs:
```bash
docker compose logs -f keycloak
```

**Look for**: "Keycloak is ready" or "Listening on: http://0.0.0.0:8080"

## Step 2: Access Keycloak Admin Console

1. Open your browser and go to: `http://localhost:8080`
2. Click **Administration Console**
3. Login with:
   - Username: `admin`
   - Password: `admin`

## Step 3: Create Realm

1. In the top-left corner, click the realm dropdown (shows "Master")
2. Click **Create Realm**
3. Enter realm name: `metrics-platform`
4. Click **Create**

## Step 4: Create Client

1. In the left sidebar, click **Clients**
2. Click **Create client**
3. Fill in:
   - **Client type**: `OpenID Connect`
   - **Client ID**: `unified-visibility-platform`
   - Click **Next**

4. On **Capability config**:
   - **Client authentication**: `OFF` (public client)
   - **Authorization**: `OFF`
   - **Standard flow**: `ON`
   - **Direct access grants**: `ON` (optional)
   - Click **Next**

5. On **Login settings**:
   - **Valid redirect URIs**: 
     - `http://localhost:5173/*`
     - `http://localhost:5173`
   - **Valid post logout redirect URIs**: 
     - `http://localhost:5173/*`
   - **Web origins**: 
     - `http://localhost:5173`
   - Click **Save**

## Step 5: Enable User Registration (Optional)

1. Go to **Realm settings** → **Login**
2. Enable **User registration**: `ON`
3. Click **Save**

## Step 6: Verify Configuration

1. Go to **Clients** → `unified-visibility-platform` → **Settings**
2. Verify:
   - Client ID: `unified-visibility-platform`
   - Access Type: `public`
   - Standard Flow Enabled: `ON`

## Troubleshooting

### Keycloak won't start
- Check logs: `docker compose logs keycloak`
- Ensure PostgreSQL is healthy: `docker compose ps`
- Keycloak takes 1-2 minutes to fully start

### Can't access admin console
- Wait for Keycloak to fully start (check logs)
- Try: `http://localhost:8080/admin`
- Default credentials: `admin` / `admin`

### CORS errors
- Make sure you added `http://localhost:5173` to **Web origins** in client settings
- Check that the frontend URL matches exactly

### Redirect URI mismatch
- Verify redirect URIs in client settings match your frontend URL exactly
- Check for trailing slashes and protocol (http vs https)

## Environment Variables

The following environment variables are already configured in `docker-compose.yml`:

- **Backend**: `KEYCLOAK_URL=http://keycloak:8080`, `KEYCLOAK_REALM=metrics-platform`
- **Frontend**: Uses defaults or set `VITE_KEYCLOAK_URL=http://localhost:8080` in `.env`

## Next Steps

After completing this setup:
1. Restart your frontend: `cd ../frontend && npm run dev`
2. Navigate to `http://localhost:5173/login`
3. Click "Sign In with Keycloak"
4. You should be redirected to Keycloak login page
