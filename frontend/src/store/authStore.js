import { create } from 'zustand';
import { getKeycloak, isKeycloakEnabled } from '@/lib/keycloak';

// Load from localStorage on init (legacy auth only)
const loadAuth = () => {
  try {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
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
    console.error('Failed to save auth from localStorage', e);
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
      if (currentState.authProviderType === 'keycloak') return;
      const newState = { ...currentState, accessToken };
      set(newState);
      saveAuth(newState);
    },

    updateTokens: (accessToken, refreshToken) => {
      const currentState = useAuthStore.getState();
      const newState = { ...currentState, accessToken, refreshToken };
      set(newState);
      saveAuth(newState);
    },
  };
});
