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

export function isKeycloakEnabled() {
  return AUTH_PROVIDER === 'keycloak' || AUTH_PROVIDER === 'both';
}

export function getAuthProvider() {
  return AUTH_PROVIDER;
}

export function getKeycloak() {
  return keycloakInstance;
}

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
    .then(() => keycloakInstance)
    .catch((err) => {
      console.error('Keycloak init failed', err);
      initPromise = null;
      keycloakInstance = null;
      return null;
    });

  return initPromise;
}

export function userFromKeycloakToken(tokenParsed) {
  if (!tokenParsed) return null;
  return {
    id: tokenParsed.sub,
    email: tokenParsed.email || tokenParsed.preferred_username || '',
    name: tokenParsed.name || tokenParsed.given_name || tokenParsed.preferred_username || '',
  };
}
