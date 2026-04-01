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
    const postLogout = `${window.location.origin}/login`;

    // IMPORTANT: Do not clear isAuthenticated before Keycloak logout.
    // Clearing it routes to /login, whose effect calls kc.login() immediately and
    // races / cancels RP-initiated logout — user stays signed in.
    if (kc) {
      try {
        kc.logout({ redirectUri: postLogout });
        return;
      } catch (err) {
        console.error('Keycloak logout failed, falling back to local sign-out', err);
      }
    }

    set({
      user: null,
      isAuthenticated: false,
    });
    window.location.assign('/login');
  },
}));
