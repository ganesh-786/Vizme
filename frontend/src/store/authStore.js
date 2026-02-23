import { create } from 'zustand';
import { getKeycloak, isKeycloakEnabled } from '@/lib/keycloak';

// Load from localStorage on init (legacy auth only)
const loadAuth = () => {
  try {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Only restore legacy auth from storage; Keycloak state is set after init
      if (parsed.authProviderType === 'keycloak') {
        return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false, authProviderType: 'legacy' };
      }
      return { ...parsed, authProviderType: parsed.authProviderType || 'legacy' };
    }
  } catch (e) {
    console.error('Failed to load auth from localStorage', e);
  }
  return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false, authProviderType: 'legacy' };
};

// Save to localStorage (legacy auth only; Keycloak does not persist tokens here)
const saveAuth = (state) => {
  try {
    if (state.authProviderType === 'keycloak') return;
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        authProviderType: state.authProviderType || 'legacy',
      })
    );
  } catch (e) {
    console.error('Failed to save auth to localStorage', e);
  }
};

export const useAuthStore = create((set, get) => {
  const initialState = loadAuth();

  return {
    ...initialState,

    setAuth: (user, accessToken, refreshToken) => {
      const newState = {
        user,
        accessToken,
        refreshToken,
        isAuthenticated: true,
        authProviderType: 'legacy',
      };
      set(newState);
      saveAuth(newState);
    },

    setKeycloakAuth: (user) => {
      set({
        user,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: true,
        authProviderType: 'keycloak',
      });
      // Keycloak tokens are not stored in our store; client reads from keycloak instance
    },

    logout: () => {
      const { authProviderType } = get();
      if (authProviderType === 'keycloak' && isKeycloakEnabled()) {
        const kc = getKeycloak();
        if (kc) kc.logout();
      }
      const newState = {
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        authProviderType: 'legacy',
      };
      set(newState);
      localStorage.removeItem('auth-storage');
    },

    updateToken: (accessToken) => {
      const currentState = get();
      if (currentState.authProviderType === 'keycloak') return; // Keycloak manages its own token
      const newState = { ...currentState, accessToken };
      set(newState);
      saveAuth(newState);
    },
  };
});
