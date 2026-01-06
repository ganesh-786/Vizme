# CORS Issue Resolution Guide

## Problem
The React frontend at `http://localhost:3001` cannot access the backend API at `http://localhost:8000` due to CORS policy errors.

## Solution

### 1. Backend CORS Configuration ✅
The backend CORS is now properly configured to:
- Allow all origins in development mode
- Handle preflight OPTIONS requests
- Include all necessary headers

### 2. Frontend Configuration ✅
The React app now uses:
- Vite proxy in development (no CORS issues)
- Direct API calls in production

## Steps to Fix

### Step 1: Restart Backend Server
The backend server MUST be restarted for CORS changes to take effect:

```bash
# Stop the current backend server (Ctrl+C)
# Then restart it:
cd backend
npm run dev
```

### Step 2: Verify Backend is Running
Check that the backend is accessible:
```bash
curl http://localhost:8000/api/v1/health
```

### Step 3: Check CORS Headers
Test CORS with a preflight request:
```bash
curl -X OPTIONS http://localhost:8000/api/v1/auth/signup \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

You should see headers like:
```
Access-Control-Allow-Origin: http://localhost:3001
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS,PATCH
Access-Control-Allow-Headers: Content-Type,Authorization,...
```

### Step 4: Use Vite Proxy (Recommended for Development)
The React app is configured to use Vite's proxy, which eliminates CORS issues entirely:

1. Start the React dev server:
```bash
cd frontend-react
npm run dev
```

2. The proxy automatically forwards `/api/*` requests to `http://localhost:8000`

3. Access the app at: `http://localhost:3001`

### Step 5: Alternative - Direct API Calls
If you want to use direct API calls (not proxy):

1. Update `.env` in `frontend-react/`:
```
VITE_API_URL=http://localhost:8000/api/v1
```

2. Make sure backend CORS allows `http://localhost:3001`

## Troubleshooting

### Issue: "No 'Access-Control-Allow-Origin' header"
**Solution:**
1. Restart the backend server
2. Check that `NODE_ENV=development` (or not set)
3. Verify CORS middleware is before other middleware

### Issue: "Preflight request fails"
**Solution:**
1. Check that OPTIONS requests are handled
2. Verify all required headers are in `allowedHeaders`
3. Check browser console for specific error

### Issue: "Proxy error"
**Solution:**
1. Make sure backend is running on port 8000
2. Check Vite proxy configuration
3. Restart Vite dev server

## Verification

After fixing, you should be able to:
1. ✅ Sign up from React app
2. ✅ Sign in from React app
3. ✅ Make API calls without CORS errors
4. ✅ See proper CORS headers in Network tab

## Production Setup

For production:
1. Set specific allowed origins in `.env`:
```
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

2. Update React app to use production API URL:
```
VITE_API_URL=https://api.yourdomain.com/api/v1
```

3. Build React app:
```bash
npm run build
```

