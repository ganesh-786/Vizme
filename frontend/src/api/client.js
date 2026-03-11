/**
 * API client — Keycloak-only (Step 5 Cutover)
 *
 * Bearer token is always taken from the Keycloak adapter.
 * On 401, attempts token refresh via Keycloak; then logout/redirect to login.
 */

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

// Request interceptor: add Bearer token from Keycloak
client.interceptors.request.use(
  async (config) => {
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
    return config;
  },
  (error) => Promise.reject(error)
);

const AUTH_ENDPOINTS = ['/auth/signin', '/auth/signup', '/auth/refresh', '/auth/password-reset-request'];
const isAuthEndpoint = (url) => AUTH_ENDPOINTS.some((endpoint) => url?.includes(endpoint));

// Response interceptor: on 401, try Keycloak token refresh then redirect to login
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (isAuthEndpoint(originalRequest?.url)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const kc = getKeycloak();
      if (kc?.authenticated) {
        originalRequest._retry = true;
        try {
          await kc.updateToken(-1);
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

    return Promise.reject(error);
  }
);

export default client;
