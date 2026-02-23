import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { getKeycloak } from '@/lib/keycloak';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const client = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: add Bearer token (legacy from store, Keycloak from adapter)
client.interceptors.request.use(
  async (config) => {
    const { authProviderType, accessToken } = useAuthStore.getState();

    if (authProviderType === 'keycloak') {
      const kc = getKeycloak();
      if (kc?.authenticated) {
        try {
          await kc.updateToken(30);
          const token = kc.token;
          if (token) config.headers.Authorization = `Bearer ${token}`;
        } catch (e) {
          if (kc.token) config.headers.Authorization = `Bearer ${kc.token}`;
        }
      }
    } else if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Auth endpoints that should not trigger token refresh on 401
const AUTH_ENDPOINTS = ['/auth/signin', '/auth/signup', '/auth/refresh'];

// Check if the request URL is an auth endpoint
const isAuthEndpoint = (url) => {
  return AUTH_ENDPOINTS.some((endpoint) => url?.includes(endpoint));
};

// Response interceptor for token refresh (legacy) and 401 handling (Keycloak)
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (isAuthEndpoint(originalRequest?.url)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const { authProviderType } = useAuthStore.getState();

      if (authProviderType === 'keycloak') {
        const kc = getKeycloak();
        if (kc?.authenticated) {
          originalRequest._retry = true;
          try {
            await kc.updateToken(-1); // Force refresh
            const token = kc.token;
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return client(originalRequest);
            }
          } catch (e) {
            useAuthStore.getState().logout();
            return Promise.reject(error);
          }
        }
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      // Legacy: refresh token flow
      originalRequest._retry = true;
      try {
        const { refreshToken, updateToken } = useAuthStore.getState();

        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
          refreshToken,
        });

        const { accessToken } = response.data.data;
        updateToken(accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return client(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default client;
