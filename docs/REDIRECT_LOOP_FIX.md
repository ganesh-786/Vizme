# Infinite Redirect Loop Fix - Keycloak Authentication

## Problem
After successful Keycloak login, the app flickers between:
- `http://localhost:5173` (frontend)
- `http://localhost:5173/#state=...&session_state=...&code=...` (OAuth callback)

## Root Causes Identified

### 1. **Keycloak `onLoad` Mode Issue**
- Using `check-sso` mode can trigger re-authentication if token isn't properly stored
- The mode checks authentication on every page load, potentially causing redirects

### 2. **Token Storage Race Condition**
- Token wasn't persisted in Zustand store before `authReady` was set
- `PrivateRoute` checked authentication before token was available, causing redirect to `/login`
- This triggered Keycloak to re-authenticate, creating an infinite loop

### 3. **Redirect URI Mismatch**
- Redirect URI must match **exactly** in Keycloak client configuration
- Trailing slashes or port mismatches cause redirect failures

### 4. **PrivateRoute Redirecting Prematurely**
- `PrivateRoute` was checking Keycloak authentication even when token existed in store
- This caused unnecessary re-authentication checks

## Fixes Applied

### 1. **Keycloak Initialization** (`frontend/src/services/keycloak.js`)
- ✅ Added `onTokenExpired` handler to prevent auto-redirects
- ✅ Improved redirect URI handling to ensure exact match
- ✅ Synchronous hash cleanup after OAuth callback processing

### 2. **PrivateRoute Guards** (`frontend/src/App.jsx`)
- ✅ Added `checkingAuthRef` to prevent multiple concurrent auth checks
- ✅ Prioritize token in store over Keycloak check (prevents loops)
- ✅ Only check Keycloak if token doesn't exist in store
- ✅ Sync Keycloak token to store if it exists but isn't stored

### 3. **Token Persistence** (`frontend/src/App.jsx`)
- ✅ Verify token is set in store before marking `authReady`
- ✅ Added delay for OAuth callback processing
- ✅ Ensure token is persisted before allowing route access

### 4. **Redirect URI** (`frontend/src/services/keycloak.js`)
- ✅ Clean redirect URI (remove trailing slashes)
- ✅ Use exact origin + pathname

## Keycloak Configuration Checklist

### ⚠️ CRITICAL: Verify these in your Keycloak Admin Console

1. **Client Settings** → `unified-visibility-platform`:
   - **Valid Redirect URIs**: Must include **exactly**:
     ```
     http://localhost:5173
     http://localhost:5173/*
     ```
   - **Web Origins**: Must include:
     ```
     http://localhost:5173
     ```
   - **Access Type**: `public` (for PKCE flow)
   - **Standard Flow Enabled**: ✅ Yes
   - **Direct Access Grants Enabled**: ❌ No (not needed for OIDC)

2. **Realm Settings**:
   - **Realm Name**: `metrics-platform` (must match `VITE_KEYCLOAK_REALM`)
   - **Frontend URL**: Leave empty or set to `http://localhost:8080`

3. **Client Protocol**: Must be `openid-connect`

## Testing the Fix

1. **Clear browser storage**:
   ```javascript
   // In browser console
   localStorage.clear();
   sessionStorage.clear();
   ```

2. **Test login flow**:
   - Navigate to `http://localhost:5173`
   - Click "Sign In with Keycloak"
   - Complete Keycloak login
   - Should redirect to `http://localhost:5173` (NO hash)
   - Dashboard should load without flickering

3. **Verify no redirect loop**:
   - After login, URL should stay at `http://localhost:5173`
   - No flickering between URLs
   - No repeated redirects to Keycloak

## Code Changes Summary

### `frontend/src/services/keycloak.js`
- Added `onTokenExpired` handler to prevent auto-redirects
- Improved `login()` redirect URI handling
- Synchronous hash cleanup after OAuth processing

### `frontend/src/App.jsx`
- Added `checkingAuthRef` to prevent concurrent auth checks
- Improved `PrivateRoute` to prioritize store token
- Added token verification before marking `authReady`
- Added delay for OAuth callback processing

## Common Issues & Solutions

### Issue: Still seeing redirect loop
**Solution**: 
1. Check Keycloak client redirect URIs match exactly
2. Clear browser storage and cookies
3. Verify `VITE_KEYCLOAK_URL` in `.env` matches your Keycloak instance

### Issue: Hash not being cleaned up
**Solution**:
- Hash cleanup happens synchronously after Keycloak processes callback
- If hash persists, check browser console for errors
- Verify Keycloak `init()` is completing successfully

### Issue: Token not persisting
**Solution**:
- Check browser localStorage for `auth-storage` key
- Verify Zustand store is saving correctly
- Check network tab for `/auth/callback` response

## Environment Variables

Ensure these are set correctly in `frontend/.env`:
```env
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=metrics-platform
VITE_KEYCLOAK_CLIENT_ID=unified-visibility-platform
VITE_API_BASE_URL=http://localhost:3002
```

## Port Configuration

- **Frontend (Vite)**: `5173`
- **Backend**: `3002` (from docker-compose.yml)
- **Keycloak**: `8080`

If you mentioned port `5713`, verify:
1. No other service is running on that port
2. No proxy or redirect is pointing to that port
3. Keycloak redirect URIs don't include `5713`
