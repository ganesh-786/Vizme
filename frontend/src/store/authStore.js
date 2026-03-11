/**
 * Auth store — Keycloak-only (Step 5 Cutover)
 *
 * User state is set after Keycloak login. Tokens are managed by the
 * Keycloak adapter; no access/refresh tokens are stored here.
 */

import { create } from 'zustand';
import { getKeycloak } from '@/lib/keycloak';

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,

  setKeycloakAuth: (user) => {
    set({
      user,
      isAuthenticated: true,
    });
  },

  logout: () => {
    const kc = getKeycloak();
    if (kc) kc.logout();
    set({
      user: null,
      isAuthenticated: false,
    });
  },
}));
