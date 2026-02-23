/**
 * Keycloak JS adapter singleton and initialization.
 * Used when VITE_AUTH_PROVIDER is "keycloak" or "both".
 */

import Keycloak from 'keycloak-js';

const AUTH_PROVIDER = import.meta.env.VITE_AUTH_PROVIDER || 'legacy';
const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'unified-visibility';
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'uv-frontend';

let keycloakInstance = null;
let initPromise = null;

/**
 * Whether Keycloak is enabled (provider is "keycloak" or "both").
 */
export function isKeycloakEnabled() {
  return AUTH_PROVIDER === 'keycloak' || AUTH_PROVIDER === 'both';
}

/**
 * Current auth provider from env.
 */
export function getAuthProvider() {
  return AUTH_PROVIDER;
}

/**
 * Get the Keycloak instance (may be null if not initialized or not enabled).
 */
export function getKeycloak() {
  return keycloakInstance;
}

/**
 * Initialize Keycloak. Safe to call multiple times — returns the same promise.
 * Resolves to the Keycloak instance when Keycloak is enabled, or null when legacy-only.
 */
export function initKeycloak() {
  if (!isKeycloakEnabled()) {
    return Promise.resolve(null);
  }

  if (initPromise) {
    return initPromise;
  }

  keycloakInstance = new Keycloak({
    url: KEYCLOAK_URL,
    realm: KEYCLOAK_REALM,
    clientId: KEYCLOAK_CLIENT_ID,
  });

  initPromise = keycloakInstance
    .init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    })
    .then((authenticated) => {
      return keycloakInstance;
    })
    .catch((err) => {
      console.error('Keycloak init failed', err);
      initPromise = null;
      keycloakInstance = null;
      return null;
    });

  return initPromise;
}

/**
 * Build user object from Keycloak token parsed payload (for auth store).
 */
export function userFromKeycloakToken(tokenParsed) {
  if (!tokenParsed) return null;
  return {
    id: tokenParsed.sub,
    email: tokenParsed.email || tokenParsed.preferred_username || '',
    name: tokenParsed.name || tokenParsed.given_name || tokenParsed.preferred_username || '',
  };
}
