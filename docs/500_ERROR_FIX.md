# 500 Internal Server Error - Resolution Guide

## Problem
The signup endpoint is returning a 500 Internal Server Error when trying to create a new user.

## Root Causes

### 1. Database Tables Not Created
The most common cause is that database tables haven't been created yet.

### 2. Database Connection Issue
The backend might not be connecting to the database properly.

### 3. Sequelize Model Errors
There might be an issue with model definitions or relationships.

## Solutions

### Solution 1: Check Database Connection (Most Likely)

The Docker backend needs to connect to the PostgreSQL database. Verify:

1. **Check if PostgreSQL is running:**
   ```bash
   docker ps | grep postgres
   ```

2. **Check backend logs:**
   ```bash
   docker logs unified_visibility_backend --tail 100
   ```

3. **Look for database connection errors:**
   - "Unable to connect to the database"
   - "Connection refused"
   - "Authentication failed"

### Solution 2: Create Database Tables

If tables don't exist, you need to sync them:

**Option A: Restart Backend (Auto-sync in development)**
```bash
docker-compose restart backend
```

**Option B: Manual Sync (if running locally)**
```bash
cd backend
node -e "require('./src/models').initializeDatabase().then(() => process.exit(0)).catch(e => {console.error(e); process.exit(1);})"
```

### Solution 3: Check Database Environment Variables

Verify the backend has correct database config:

```bash
docker exec unified_visibility_backend env | grep DB_
```

Should show:
- `DB_HOST=postgres`
- `DB_PORT=5432`
- `DB_NAME=visibility_platform`
- `DB_USER=postgres`
- `DB_PASSWORD=postgres`

### Solution 4: Rebuild and Restart

If nothing works, rebuild the containers:

```bash
docker-compose down
docker-compose up -d --build
```

This will:
1. Recreate all containers
2. Rebuild the backend image
3. Initialize the database connection
4. Sync database tables

## Debugging Steps

### Step 1: Check Backend Logs
```bash
docker logs unified_visibility_backend --tail 50 -f
```

Look for:
- ✅ "Database connection established successfully"
- ✅ "Database models synchronized"
- ❌ Any error messages

### Step 2: Test Database Connection
```bash
docker exec unified_visibility_backend node -e "
const { sequelize } = require('./src/models');
sequelize.authenticate()
  .then(() => console.log('✅ DB Connected'))
  .catch(e => console.error('❌ DB Error:', e.message));
"
```

### Step 3: Check if Tables Exist
```bash
docker exec -it unified_visibility_postgres psql -U postgres -d visibility_platform -c "\dt"
```

Should show:
- users
- api_keys
- metric_configs

### Step 4: Test Signup Endpoint Directly
```bash
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "firstName": "Test",
    "lastName": "User"
  }' \
  -v
```

Check the response for detailed error message.

## Common Errors and Fixes

### Error: "relation 'users' does not exist"
**Fix:** Tables not created. Restart backend or sync manually.

### Error: "Connection refused"
**Fix:** PostgreSQL not running or wrong host. Check `DB_HOST=postgres` in docker-compose.

### Error: "password authentication failed"
**Fix:** Wrong database credentials. Check environment variables.

### Error: "SequelizeValidationError"
**Fix:** Invalid data being sent. Check request body format.

## Quick Fix Command

Run this to restart everything and check status:

```bash
# Restart all services
docker-compose restart

# Wait a few seconds, then check logs
docker logs unified_visibility_backend --tail 20

# Test health endpoint
curl http://localhost:8000/api/v1/health
```

## Expected Behavior

After fixing, you should see:

1. **Backend logs:**
   ```
   ✅ Database connection established successfully.
   ✅ Database models synchronized.
   🚀 Unified Visibility Platform API Server running on port 8000
   ```

2. **Signup request:**
   - Status: 201 Created
   - Response: User data + API key + token

3. **No errors in browser console**

## Prevention

To avoid this in the future:

1. Always check backend logs after starting Docker
2. Ensure database is healthy before backend starts (healthcheck)
3. Use migrations in production instead of sync
4. Add better error logging

## Still Having Issues?

1. Check all logs: `docker-compose logs`
2. Verify database is accessible: `docker exec -it unified_visibility_postgres psql -U postgres`
3. Check network connectivity: `docker network inspect unified_visibility_platform_visibility_network`
4. Review error handler output in browser console (now shows detailed errors in development)

