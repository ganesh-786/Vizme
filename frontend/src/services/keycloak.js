import Keycloak from 'keycloak-js';

// Keycloak configuration
const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'master',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'unified-visibility-platform'
};

const keycloak = new Keycloak(keycloakConfig);

// Singleton guards
let initPromise = null;
let isInitializing = false;
let isInitialized = false;

// Initialize Keycloak - singleton pattern ensures it only runs once
export const initKeycloak = (onAuthenticatedCallback) => {
  // If already initialized, return immediately
  if (isInitialized) {
    if (onAuthenticatedCallback && keycloak.authenticated) {
      onAuthenticatedCallback();
    }
    return Promise.resolve(keycloak.authenticated);
  }

  // If currently initializing, return the existing promise
  if (isInitializing && initPromise) {
    return initPromise.then((authenticated) => {
      if (onAuthenticatedCallback && authenticated) {
        onAuthenticatedCallback();
      }
      return authenticated;
    });
  }

  isInitializing = true;

  initPromise = keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    checkLoginIframe: false,
    enableLogging: false,
    flow: 'standard',
    responseMode: 'fragment'
  }).then(async (authenticated) => {
    isInitialized = true;
    isInitializing = false;
    
    // CRITICAL: Clean OAuth hash SYNCHRONOUSLY before anything else
    const hash = window.location.hash;
    if (hash && (hash.includes('state=') || hash.includes('code=') || hash.includes('session_state='))) {
      window.history.replaceState(
        { keycloakProcessed: true }, 
        '', 
        window.location.origin + window.location.pathname
      );
    }
    
    // CRITICAL: AWAIT the callback if it's async
    // This ensures auth state is set BEFORE the promise resolves
    if (authenticated && onAuthenticatedCallback) {
      await onAuthenticatedCallback();
    }
    return authenticated;
  }).catch((error) => {
    isInitialized = true;
    isInitializing = false;
    console.error('Keycloak init failed:', error);
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.origin + window.location.pathname);
    }
    return false;
  });

  return initPromise;
};

// Login - always redirect to root after successful auth
export const login = () => {
  return keycloak.login({
    redirectUri: window.location.origin
  });
};

// Register
export const register = () => {
  return keycloak.register({
    redirectUri: window.location.origin
  });
};

// Logout
export const logout = () => {
  return keycloak.logout({
    redirectUri: window.location.origin
  });
};

// Get token
export const getToken = () => {
  return keycloak.token;
};

// Get user info
export const getUserInfo = () => {
  return keycloak.tokenParsed;
};

// Check if authenticated
export const isAuthenticated = () => {
  return keycloak.authenticated;
};

// Register token update callback
export const onTokenExpired = (callback) => {
  keycloak.onTokenExpired = callback;
};

// Update token
export const updateToken = (minValidity = 5) => {
  return keycloak.updateToken(minValidity);
};

// Get the Keycloak instance (for advanced usage)
export const getKeycloakInstance = () => {
  return keycloak;
};

// Check if Keycloak is initialized (for API client to block calls)
export const isKeycloakInitialized = () => {
  return isInitialized;
};

export default keycloak;

