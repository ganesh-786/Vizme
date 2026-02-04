/**
 * Keycloak-based auth routes.
 * Login and signup (registration) happen in Keycloak; this API exposes
 * config URLs, token exchange (to avoid CORS), and /me.
 */
import express from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/auth.middleware.js';
import { BadRequestError } from '../middleware/errorHandler.js';

const router = express.Router();

const KEYCLOAK_ISSUER_URI = process.env.KEYCLOAK_ISSUER_URI;
/** When set (e.g. in Docker), backend uses this to reach Keycloak for token exchange (cannot use localhost from container). */
const KEYCLOAK_INTERNAL_ISSUER_URI = process.env.KEYCLOAK_INTERNAL_ISSUER_URI;
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'metrics-client';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'metrics';
/** URL the browser uses to reach Keycloak (e.g. http://localhost:8180). Must match KC_HOSTNAME/KC_HOSTNAME_PORT. */
const KEYCLOAK_PUBLIC_URL = process.env.KEYCLOAK_PUBLIC_URL || 'http://localhost:8180';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * GET /api/v1/auth/me
 * Returns the current user (requires Keycloak Bearer token).
 * Frontend calls this after redirect from Keycloak with the access token.
 */
router.get('/me', ...authenticate, (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/auth/config
 * Public endpoint: returns Keycloak URLs for login and registration.
 * Frontend uses these to redirect users to Keycloak for login/signup.
 */
router.get('/config', (req, res) => {
  if (!KEYCLOAK_ISSUER_URI) {
    return res.status(503).json({
      success: false,
      error: 'Keycloak not configured',
      message: 'KEYCLOAK_ISSUER_URI is not set',
    });
  }
  const publicBase = KEYCLOAK_PUBLIC_URL.replace(/\/$/, '') + '/realms/' + KEYCLOAK_REALM;
  const redirectUri = `${FRONTEND_URL}/callback`;
  const redirectUriEnc = encodeURIComponent(redirectUri);
  const scope = encodeURIComponent('openid profile email');
  const authBase = `${publicBase}/protocol/openid-connect/auth`;
  const commonParams = `client_id=${KEYCLOAK_CLIENT_ID}&redirect_uri=${redirectUriEnc}&response_type=code&scope=${scope}`;
  // Standard login URL
  const loginUrl = `${authBase}?${commonParams}&prompt=login`;
  // User self-registration: use kc_action=register so Keycloak shows the registration form
  const registerUrl = `${authBase}?${commonParams}&kc_action=register`;
  const signupRedirect = encodeURIComponent(`${FRONTEND_URL}/signup?then=register`);
  const logoutUrl = `${publicBase}/protocol/openid-connect/logout?client_id=${KEYCLOAK_CLIENT_ID}&post_logout_redirect_uri=${signupRedirect}`;
  res.json({
    success: true,
    data: {
      loginUrl,
      registerUrl,
      logoutUrl,
      redirectUri,
      issuerUri: KEYCLOAK_ISSUER_URI.replace(/\/$/, ''),
      clientId: KEYCLOAK_CLIENT_ID,
    },
  });
});

/**
 * POST /api/v1/auth/token
 * Public endpoint: exchange Keycloak authorization code for tokens (server-side to avoid CORS).
 * Body: { code, redirect_uri } (redirect_uri must match FRONTEND_URL/callback).
 */
router.post('/token', async (req, res, next) => {
  try {
    if (!KEYCLOAK_ISSUER_URI) {
      return res.status(503).json({
        success: false,
        error: 'Keycloak not configured',
        message: 'KEYCLOAK_ISSUER_URI is not set',
      });
    }
    const code = req.body?.code;
    const redirectUri = req.body?.redirect_uri;
    if (!code || !redirectUri) {
      throw new BadRequestError('code and redirect_uri are required');
    }
    const expectedRedirect = `${FRONTEND_URL.replace(/\/$/, '')}/callback`;
    if (redirectUri !== expectedRedirect) {
      throw new BadRequestError('redirect_uri does not match configured FRONTEND_URL');
    }
    const issuerBase = (KEYCLOAK_INTERNAL_ISSUER_URI || KEYCLOAK_ISSUER_URI || '').replace(/\/$/, '');
    const tokenUrl = `${issuerBase}/protocol/openid-connect/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: KEYCLOAK_CLIENT_ID,
    });
    if (KEYCLOAK_CLIENT_SECRET) {
      params.set('client_secret', KEYCLOAK_CLIENT_SECRET);
    }
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (response.status !== 200) {
      const errBody = response.data || {};
      const msg = errBody.error_description || errBody.error || response.statusText;
      return res.status(response.status === 400 ? 400 : 502).json({
        success: false,
        error: 'Token exchange failed',
        message: msg,
      });
    }
    const data = response.data;
    res.json({
      success: true,
      data: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        token_type: data.token_type || 'Bearer',
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
