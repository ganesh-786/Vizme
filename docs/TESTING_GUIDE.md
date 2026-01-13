# Complete Testing Guide - Keycloak Authentication

## Where Login/Logout State is Stored

### Frontend Storage
- **Location**: Browser's Local Storage
- **Key**: `auth-storage`
- **Contains**:
  - `user`: User information (id, email, name)
  - `token`: Keycloak access token
  - `isAuthenticated`: Boolean flag

**How to Check:**
1. Open browser DevTools (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Expand **Local Storage**
4. Click on your site URL (e.g., `http://localhost:5173`)
5. Look for key: `auth-storage`
6. Click on it to see the stored data

### Keycloak Storage
- **Location**: Keycloak session cookies
- **Cookies**: Various Keycloak session cookies
- **Purpose**: Maintains SSO session with Keycloak

**How to Check:**
1. Open browser DevTools (F12)
2. Go to **Application** tab → **Cookies**
3. Look for cookies starting with `KEYCLOAK_` or related to your Keycloak URL

---

## Step-by-Step Testing Guide (Beginner Friendly)

### Prerequisites Check

#### Step 1: Verify All Services Are Running

```bash
# Check if all Docker containers are running
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/docker
docker compose ps
```

**Expected Output:**
- `metrics_backend` - Status: Up
- `metrics_postgres` - Status: Up
- `metrics_prometheus` - Status: Up
- `metrics_grafana` - Status: Up
- `metrics_pushgateway` - Status: Up

**If any service is down:**
```bash
docker compose up -d
```

#### Step 2: Verify Keycloak is Running

1. Open browser
2. Go to: `http://localhost:8081`
3. You should see Keycloak welcome page or login page

**If Keycloak is not accessible:**
- Check if Keycloak is running on your system
- Verify port 8081 is not blocked

#### Step 3: Verify Backend is Running

```bash
# Test backend health endpoint
curl http://localhost:3000/health
```

**Expected Output:**
```json
{"success":true,"status":"healthy","timestamp":"...","uptime":...}
```

#### Step 4: Verify Frontend is Running

1. Open browser
2. Go to: `http://localhost:5173`
3. You should see the application

**If frontend is not running:**
```bash
cd /home/anjana778/Documents/ProjectA/unified_visibility_platform/frontend
npm run dev
```

---

### Testing Authentication Flow

#### Test 1: Initial Login

1. **Open Browser**
   - Go to: `http://localhost:5173`
   - You should be redirected to `/login` if not authenticated

2. **Open Browser DevTools**
   - Press `F12` or right-click → Inspect
   - Go to **Console** tab
   - Keep it open to see any errors

3. **Click "Sign In with Keycloak"**
   - You should be redirected to Keycloak login page
   - URL should be: `http://localhost:8081/realms/metrics-platform/...`

4. **Login with Keycloak**
   - Enter your Keycloak username and password
   - Click "Sign In"

5. **Verify Redirect Back**
   - After login, you should be redirected back to your app
   - URL should be: `http://localhost:5173/`
   - You should see the Dashboard

6. **Check Browser Console**
   - Should see: "User is authenticated" or similar
   - No red errors should appear

#### Test 2: Verify User Data Storage

1. **Check Local Storage**
   - Open DevTools → **Application** tab → **Local Storage**
   - Click on `http://localhost:5173`
   - Find `auth-storage` key
   - Click on it
   - You should see:
     ```json
     {
       "user": {
         "id": 1,
         "email": "your-email@example.com",
         "name": "Your Name"
       },
       "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
       "isAuthenticated": true
     }
     ```

2. **Check Database**
   ```bash
   # Connect to PostgreSQL
   docker exec -it metrics_postgres psql -U postgres -d metrics_db
   
   # Check users table
   SELECT id, email, name, keycloak_id, created_at FROM users;
   
   # Exit
   \q
   ```
   
   **Expected:** Your user should appear with `keycloak_id` populated

#### Test 3: Verify API Calls Work

1. **Open Browser DevTools**
   - Go to **Network** tab
   - Filter by "Fetch/XHR"

2. **Navigate to Dashboard**
   - Go to: `http://localhost:5173/`
   - Watch the Network tab

3. **Check API Calls**
   - You should see calls to:
     - `/api/v1/metric-configs`
     - `/api/v1/api-keys`
   - Status should be `200` (green)
   - Not `401` (Unauthorized) or `403` (Forbidden)

4. **Check Request Headers**
   - Click on any API request
   - Go to **Headers** tab
   - Look for `Authorization: Bearer ...`
   - Should have a token value

#### Test 4: Create API Key

1. **Navigate to API Keys Page**
   - Click "API Keys" in navigation or go to: `http://localhost:5173/api-keys`

2. **Open Browser DevTools**
   - Keep **Network** tab open

3. **Create New API Key**
   - Click "Create API Key" button
   - Enter a name (e.g., "Test Key")
   - Click "Create"

4. **Verify Success**
   - Should see the new API key displayed
   - Network tab should show:
     - Request to `/api/v1/api-keys` with `POST` method
     - Status: `201` (Created) or `200` (OK)
     - Response should contain the API key

5. **If It Fails**
   - Check Network tab for error
   - Status code `401`: Authentication issue
   - Status code `500`: Server error
   - Check Console tab for error messages

#### Test 5: Create Metric Config

1. **Navigate to Metric Configs**
   - Click "Metric Configs" or go to: `http://localhost:5173/metric-configs`

2. **Open Browser DevTools**
   - Keep **Network** tab open

3. **Create New Metric Config**
   - Click "Create Metric Config" or "Add New"
   - Fill in the form:
     - Name: "Test Metric"
     - Metric Name: "test_metric"
     - Type: Select from dropdown
     - Description: "Test description"
   - Click "Create" or "Save"

4. **Verify Success**
   - Should see the new metric config in the list
   - Network tab should show:
     - Request to `/api/v1/metric-configs` with `POST` method
     - Status: `201` (Created) or `200` (OK)

#### Test 6: Verify Logout

1. **Click Logout Button**
   - Top right corner of the page
   - Click "Logout"

2. **Verify Redirect**
   - Should be redirected to `/login` page
   - Should NOT see dashboard content

3. **Check Local Storage**
   - DevTools → Application → Local Storage
   - `auth-storage` should be removed or empty

4. **Verify Keycloak Logout**
   - Should be logged out from Keycloak as well
   - Try accessing Keycloak admin console
   - Should require login again

---

## Troubleshooting Common Issues

### Issue 1: "Failed to fetch resources" on Dashboard

**Symptoms:**
- Dashboard loads but shows "Failed to fetch" error
- API calls return 401 or 403

**Diagnosis:**
1. Open DevTools → Network tab
2. Check failed requests
3. Look at Response tab for error message

**Solutions:**

**A. Token Not Being Sent:**
```javascript
// Check in Console tab:
localStorage.getItem('auth-storage')
// Should return JSON with token
```

**B. Token Expired:**
- Logout and login again
- Token should auto-refresh, but if it doesn't, re-login

**C. Backend Can't Validate Token:**
```bash
# Check backend logs
docker logs metrics_backend --tail 50

# Look for Keycloak connection errors
```

**Fix:**
- Verify Keycloak is accessible from backend
- Check environment variables in docker-compose.yml

### Issue 2: "Failed to create" when creating resources

**Symptoms:**
- Clicking create button shows error
- Nothing is created

**Diagnosis:**
1. Open DevTools → Network tab
2. Find the failed request (usually POST)
3. Check:
   - Status code (401, 403, 500, etc.)
   - Response body for error message
   - Request headers (Authorization header present?)

**Solutions:**

**A. 401 Unauthorized:**
- Token is missing or invalid
- Solution: Logout and login again

**B. 403 Forbidden:**
- User doesn't have permission
- Solution: Check Keycloak user roles

**C. 500 Server Error:**
- Backend error
- Solution: Check backend logs
  ```bash
  docker logs metrics_backend --tail 50
  ```

### Issue 3: Double "Sign In with Keycloak" Button

**Fixed!** This was caused by double Keycloak initialization. The fix has been applied.

**If you still see it:**
1. Clear browser cache
2. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
3. Restart frontend:
   ```bash
   # Stop frontend (Ctrl+C)
   cd frontend
   npm run dev
   ```

### Issue 4: Login Works But Can't Access Pages

**Symptoms:**
- Login successful
- Redirected to dashboard
- But immediately redirected back to login

**Diagnosis:**
- Check if token is stored
- Check if PrivateRoute is working

**Solution:**
1. Check Local Storage (as described above)
2. Check Console for errors
3. Verify `isAuthenticated` is `true` in storage

---

## Quick Verification Checklist

After completing all tests, verify:

- [ ] Can login via Keycloak
- [ ] Redirected back to app after login
- [ ] User data stored in Local Storage
- [ ] User synced to database with `keycloak_id`
- [ ] Dashboard loads without errors
- [ ] Can create API key successfully
- [ ] Can create metric config successfully
- [ ] Logout works and clears storage
- [ ] Cannot access protected pages after logout

---

## Advanced Debugging

### Check Backend Logs
```bash
# Real-time logs
docker logs -f metrics_backend

# Last 100 lines
docker logs metrics_backend --tail 100

# Filter for errors
docker logs metrics_backend 2>&1 | grep -i error
```

### Check Frontend Console
1. Open DevTools → Console
2. Look for:
   - Red error messages
   - Failed API calls
   - Authentication errors

### Test API Directly
```bash
# Get token from browser Local Storage first
# Then test:
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/v1/auth/me

# Should return user info
```

### Verify Keycloak Configuration
```bash
# Test Keycloak endpoint
curl http://localhost:8081/realms/metrics-platform/.well-known/openid-configuration

# Should return JSON configuration
```

---

## Need Help?

If you encounter issues not covered here:

1. **Check Backend Logs**: `docker logs metrics_backend`
2. **Check Browser Console**: F12 → Console tab
3. **Check Network Tab**: F12 → Network tab → Look for failed requests
4. **Verify Environment Variables**: Check docker-compose.yml and frontend/.env
5. **Verify Keycloak**: Ensure Keycloak is running and accessible

