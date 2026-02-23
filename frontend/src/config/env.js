/**
 * Frontend env config. Only VITE_* vars are exposed by Vite.
 * In production build, ensure VITE_API_BASE_URL points to your API.
 */

const isProd = import.meta.env.PROD;

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  isProduction: isProd,
};

/**
 * Resolve API base URL: explicit env, or same origin in production, or localhost in dev.
 */
export function getApiBaseUrl() {
  if (env.apiBaseUrl) return env.apiBaseUrl.replace(/\/$/, '');
  if (isProd) return ''; // same origin
  return 'http://localhost:3000';
}

/**
 * Call at app init to warn in console if production build might have wrong API URL.
 */
export function validateEnv() {
  if (isProd && !env.apiBaseUrl) {
    console.warn(
      '[Vizme] VITE_API_BASE_URL is not set. API requests will use same origin. ' +
      'Set it in your build env if the API is on a different host.'
    );
  }
}
