/**
 * Keycloak JS adapter singleton and initialization (Step 5 Cutover).
 * Auth is Keycloak-only; no legacy provider checks.
 */

import Keycloak from 'keycloak-js';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'unified-visibility';
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'uv-frontend';

let keycloakInstance = null;
let initPromise = null;

export function isKeycloakEnabled() {
  return true;
}

export function getKeycloak() {
  return keycloakInstance;
}

/**
 * Initialize Keycloak. Safe to call multiple times — returns the same promise.
 */
export function initKeycloak() {
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
    .then(() => keycloakInstance)
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
