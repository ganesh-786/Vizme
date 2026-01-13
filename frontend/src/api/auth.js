import client from './client';
import { getToken } from '../services/keycloak';

export const authAPI = {
  // Keycloak callback - sync user with backend
  callback: async (token) => {
    const response = await client.post('/auth/callback', {
      token
    });
    return response.data.data;
  },

  // Get current user info
  getMe: async () => {
    const response = await client.get('/auth/me');
    return response.data.data;
  },

  // Logout
  logout: async () => {
    const response = await client.post('/auth/logout');
    return response.data;
  }
};

