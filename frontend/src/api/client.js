import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const client = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Global token refresh lock - prevents concurrent refresh attempts
let isRefreshing = false;
let refreshPromise = null;

// Request interceptor to add auth token and block until auth is ready
client.interceptors.request.use(
  async (config) => {
    // CRITICAL: Check for public routes FIRST, before authReady check
    // Auth callback is called during Keycloak init, before authReady is true
    const isPublicRoute = config.url?.includes('/auth/callback') || config.url?.includes('/auth/login');
    
    // For public routes, just pass through with the token from config if provided
    if (isPublicRoute) {
      return config;
    }
    
    // Block non-public API calls until auth is ready
    const { authReady, token } = useAuthStore.getState();
    if (!authReady) {
      return Promise.reject(new Error('Auth not ready - blocking API call'));
    }

    // For authenticated routes (non-public), require token
    let authToken = token;
    
    // If no token in store, try to get from Keycloak
    if (!authToken) {
      const keycloak = await import('../services/keycloak');
      if (keycloak.isAuthenticated()) {
        authToken = keycloak.getToken();
      }
    }
    
    // If still no token, reject
    if (!authToken) {
      return Promise.reject(new Error('No authentication token available'));
    }
    
    config.headers.Authorization = `Bearer ${authToken}`;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for token refresh - with lock to prevent loops
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401 if not already retried and auth is ready
    if (error.response?.status === 401 && !originalRequest._retry) {
      const { authReady } = useAuthStore.getState();
      if (!authReady) {
        // Auth not ready yet, reject immediately - don't retry
        return Promise.reject(error);
      }

      // If already refreshing, wait for that refresh to complete
      if (isRefreshing && refreshPromise) {
        try {
          await refreshPromise;
          const newToken = (await import('../services/keycloak')).getToken();
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return client(originalRequest);
        } catch (refreshError) {
          return Promise.reject(refreshError);
        }
      }

      // Mark request as retried to prevent infinite loops
      originalRequest._retry = true;
      isRefreshing = true;

      // Start token refresh
      refreshPromise = (async () => {
        try {
          const { updateToken: updateKeycloakToken } = await import('../services/keycloak');
          const updated = await updateKeycloakToken(5);
          
          if (updated) {
            const newToken = (await import('../services/keycloak')).getToken();
            const { updateToken } = useAuthStore.getState();
            updateToken(newToken);
            return newToken;
          } else {
            throw new Error('Token refresh failed');
          }
        } catch (refreshError) {
          // Clear refresh lock on error
          isRefreshing = false;
          refreshPromise = null;
          useAuthStore.getState().logout();
          const { login } = await import('../services/keycloak');
          login();
          throw refreshError;
        }
      })();

      try {
        const newToken = await refreshPromise;
        // Clear refresh lock on success
        isRefreshing = false;
        refreshPromise = null;
        
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        // Retry original request once - no further retries
        return client(originalRequest);
      } catch (refreshError) {
        // Clear refresh lock on error
        isRefreshing = false;
        refreshPromise = null;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default client;

