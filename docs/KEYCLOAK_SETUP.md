# Keycloak Setup Guide

This guide will help you configure Keycloak for the Unified Visibility Platform.

## Prerequisites

- Keycloak installed and running on your system
- Access to Keycloak Admin Console

## Step-by-Step Keycloak Configuration

### 1. Access Keycloak Admin Console

1. Open your browser and navigate to your Keycloak URL (default: `http://localhost:8080`)
2. Click on **Administration Console**
3. Log in with your admin credentials (default: `admin` / `admin`)

### 2. Create a New Realm

1. In the top-left corner, click on the realm dropdown (usually shows "Master")
2. Click **Create Realm**
3. Enter realm name: `unified-visibility-platform` (or your preferred name)
4. Click **Create**

### 3. Create a Client

1. In the left sidebar, click **Clients**
2. Click **Create client**
3. Fill in the following:
   - **Client type**: `OpenID Connect`
   - **Client ID**: `unified-visibility-platform`
   - Click **Next**

4. On the **Capability config** page:
   - Enable **Client authentication**: `OFF` (for public client)
   - Enable **Authorization**: `OFF`
   - Enable **Standard flow**: `ON` (for authorization code flow)
   - Enable **Direct access grants**: `ON` (optional, for direct login)
   - Click **Next**

5. On the **Login settings** page:
   - **Root URL**: Leave empty or set to your frontend URL (e.g., `http://localhost:5173`)
   - **Home URL**: Leave empty or set to your frontend URL
   - **Valid redirect URIs**: 
     - `http://localhost:5173/*`
     - `http://localhost:3000/*` (if needed)
     - Add your production URLs if applicable
   - **Valid post logout redirect URIs**: 
     - `http://localhost:5173/*`
     - Add your production URLs if applicable
   - **Web origins**: 
     - `http://localhost:5173`
     - `http://localhost:3000` (if needed)
     - Add your production URLs if applicable
   - Click **Save**

### 4. Configure Client Settings (Optional but Recommended)

1. Go to **Clients** → `unified-visibility-platform`
2. Go to the **Settings** tab
3. Scroll down to **Advanced settings**:
   - **Access Token Lifespan**: `15 minutes` (default)
   - **SSO Session Idle**: `30 minutes`
   - **SSO Session Max**: `10 hours`
4. Click **Save**

### 5. Get Required Information

After configuration, you'll need the following information:

#### Keycloak URL
- This is the base URL of your Keycloak server
- Example: `http://localhost:8080`
- **Where to find**: Your Keycloak server URL

#### Realm Name
- The realm you created (e.g., `unified-visibility-platform`)
- **Where to find**: Top-left dropdown in Keycloak Admin Console

#### Client ID
- The client ID you created (e.g., `unified-visibility-platform`)
- **Where to find**: Clients → Your client → Settings tab → Client ID

#### Client Secret (if using confidential client)
- Only needed if you enabled "Client authentication"
- **Where to find**: Clients → Your client → Credentials tab → Client secret

### 6. Configure Environment Variables

#### Backend Environment Variables

Add these to your `docker-compose.yml` or `.env` file:

```env
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=unified-visibility-platform
KEYCLOAK_CLIENT_ID=unified-visibility-platform
```

Update `docker/docker-compose.yml`:

```yaml
backend:
  environment:
    - KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8080}
    - KEYCLOAK_REALM=${KEYCLOAK_REALM:-unified-visibility-platform}
    - KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID:-unified-visibility-platform}
```

#### Frontend Environment Variables

Create a `.env` file in the `frontend` directory:

```env
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=unified-visibility-platform
VITE_KEYCLOAK_CLIENT_ID=unified-visibility-platform
```

### 7. Enable User Registration (Optional)

If you want users to be able to register:

1. Go to **Realm settings** → **Login**
2. Enable **User registration**: `ON`
3. Click **Save**

### 8. Test the Configuration

1. Start your backend and frontend services
2. Navigate to the login page
3. Click "Sign In with Keycloak"
4. You should be redirected to Keycloak login page
5. After successful login, you should be redirected back to your application

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Make sure you've added your frontend URL to "Web origins" in client settings
   - Check that Keycloak allows CORS from your frontend domain

2. **Redirect URI Mismatch**
   - Verify that the redirect URI in your frontend matches exactly what's configured in Keycloak
   - Check for trailing slashes and protocol (http vs https)

3. **Token Verification Fails**
   - Ensure `KEYCLOAK_URL` and `KEYCLOAK_REALM` are correct in backend environment
   - Check that Keycloak is accessible from your backend server

4. **User Not Syncing to Database**
   - Check backend logs for errors
   - Verify database connection
   - Ensure the `keycloak_id` column exists in the users table

### Getting Keycloak Information Programmatically

You can also get the required information from Keycloak's well-known endpoint:

```
GET {KEYCLOAK_URL}/realms/{REALM}/.well-known/openid-configuration
```

This returns a JSON with all configuration including:
- `issuer`: The issuer URL
- `authorization_endpoint`: Authorization endpoint
- `token_endpoint`: Token endpoint
- `jwks_uri`: JWKS URI for public keys

## Security Best Practices

1. **Use HTTPS in Production**: Always use HTTPS for Keycloak in production
2. **Set Appropriate Token Lifespans**: Configure token expiration times based on your security requirements
3. **Enable MFA**: Consider enabling multi-factor authentication for enhanced security
4. **Regular Updates**: Keep Keycloak updated to the latest version
5. **Secure Admin Console**: Use strong passwords and limit admin console access

## Additional Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak JavaScript Adapter](https://www.keycloak.org/docs/latest/securing_apps/#_javascript_adapter)
- [OpenID Connect Specification](https://openid.net/specs/openid-connect-core-1_0.html)

