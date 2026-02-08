/**
 * Keycloak-based auth API.
 * Login/signup = redirect to Keycloak; callback exchanges code for tokens and fetches /me.
 */
import axios from 'axios';
import client from './client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const configBase = `${API_BASE_URL}/api/v1`;

export const authAPI = {
  /** Public: get Keycloak login/register URLs and token endpoint for code exchange */
  getConfig: async () => {
    const response = await axios.get(`${configBase}/auth/config`);
    return response.data.data;
  },

  /** Exchange Keycloak authorization code for tokens via backend (avoids CORS with Keycloak). */
  exchangeCodeForTokens: async (code, redirectUri) => {
    const response = await axios.post(`${configBase}/auth/token`, { code, redirect_uri: redirectUri });
    const data = response.data?.data;
    if (!data?.access_token) throw new Error('No access_token in token response');
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type || 'Bearer',
    };
  },

  /** Get current user (requires Bearer token in client) */
  getMe: async () => {
    const response = await client.get('/auth/me');
    return response.data.data;
  },

  /** Get current user with token (use in callback so 401 doesn't trigger client's logout redirect) */
  getMeWithToken: async (accessToken) => {
    const response = await axios.get(`${configBase}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data.data;
  },
};
