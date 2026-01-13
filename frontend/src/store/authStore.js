import { create } from 'zustand';
import { getToken, getUserInfo, isAuthenticated } from '../services/keycloak';

// Load from localStorage on init
const loadAuth = () => {
  try {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Return stored state but mark as NOT authenticated initially
      // This prevents showing protected content before Keycloak validates the token
      return {
        user: parsed.user,
        token: parsed.token,
        // Don't trust localStorage auth state - Keycloak will confirm
        isAuthenticated: false
      };
    }
  } catch (e) {
    console.error('Failed to load auth from localStorage', e);
  }
  return { user: null, token: null, isAuthenticated: false };
};

// Save to localStorage
const saveAuth = (state) => {
  try {
    localStorage.setItem('auth-storage', JSON.stringify({
      user: state.user,
      token: state.token,
      isAuthenticated: state.isAuthenticated
    }));
  } catch (e) {
    console.error('Failed to save auth to localStorage', e);
  }
};

export const useAuthStore = create((set, get) => {
  const initialState = loadAuth();
  
  return {
    ...initialState,
    authReady: false, // Track when Keycloak is fully initialized
    
    setAuth: (user, token) => {
      // CRITICAL: Batch all state changes in one update
      const newState = {
        user,
        token,
        isAuthenticated: true
      };
      set(newState);
      saveAuth(newState);
    },
    
    setAuthReady: (ready) => {
      // Only update if value actually changes
      const current = get().authReady;
      if (current !== ready) {
        set({ authReady: ready });
      }
    },
    
    logout: () => {
      const newState = {
        user: null,
        token: null,
        isAuthenticated: false,
        authReady: false
      };
      set(newState);
      localStorage.removeItem('auth-storage');
    },
    
    updateToken: (token) => {
      // Only update if token actually changed
      const current = get().token;
      if (current !== token) {
        const newState = { ...get(), token };
        set({ token });
        saveAuth(newState);
      }
    },
    
    // Sync with Keycloak state
    syncWithKeycloak: () => {
      if (isAuthenticated()) {
        const token = getToken();
        const keycloakUserInfo = getUserInfo();
        
        // Only update if we don't already have this token
        const currentToken = get().token;
        if (currentToken === token) {
          // Already synced, don't trigger unnecessary update
          return { user: get().user, token };
        }
        
        const user = {
          id: null, // Will be set after backend sync
          email: keycloakUserInfo?.email,
          name: keycloakUserInfo?.name || keycloakUserInfo?.preferred_username || keycloakUserInfo?.email
        };
        set({ user, token, isAuthenticated: true });
        saveAuth({ user, token, isAuthenticated: true });
        return { user, token };
      }
      return null;
    }
  };
});

