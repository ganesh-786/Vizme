import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { getApiBaseUrl } from '@/config/env';
import { getKeycloak } from '@/lib/keycloak';

const API_BASE_URL = getApiBaseUrl();

const client = axios.create({
  baseURL: API_BASE_URL ? `${API_BASE_URL}/api/v1` : '/api/v1',
  withCredentials: true,
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
const AUTH_ENDPOINTS = ['/auth/signin', '/auth/signup', '/auth/refresh', '/auth/logout'];

// Check if the request URL is an auth endpoint
const isAuthEndpoint = (url) => {
  return AUTH_ENDPOINTS.some((endpoint) => url?.includes(endpoint));
};

// Token refresh queue to prevent race conditions
// When multiple requests get 401 simultaneously, only one refresh happens
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor for token refresh
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip token refresh logic for auth endpoints (login/signup/refresh)
    // These should just return the error so the form can display it
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

      // If a refresh is already in progress, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        });
      }

      isRefreshing = true;

      try {
        const { refreshToken } = useAuthStore.getState();

        const response = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
          refreshToken,
        }, {
          withCredentials: true,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        useAuthStore.getState().updateTokens(accessToken, newRefreshToken);

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default client;
