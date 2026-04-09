import { create } from 'zustand';

const STORAGE_KEY = 'auth-storage';

/**
 * Hydrate the user profile (non-secret) from localStorage.
 * Tokens are never persisted — they live in memory only and are
 * restored via httpOnly cookie refresh on page reload.
 */
const loadAuth = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { user } = JSON.parse(stored);
      if (user) return { user, isAuthenticated: true };
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return { user: null, accessToken: null, isAuthenticated: false };
};

const saveUser = (user) => {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage full or blocked — non-fatal
  }
};

export const useAuthStore = create((set) => {
  const initialState = loadAuth();

  return {
    user: initialState.user,
    accessToken: initialState.accessToken ?? null,
    isAuthenticated: initialState.isAuthenticated,

    setAuth: (user, accessToken) => {
      set({ user, accessToken, isAuthenticated: true });
      saveUser(user);
    },

    logout: () => {
      set({ user: null, accessToken: null, isAuthenticated: false });
      localStorage.removeItem(STORAGE_KEY);
    },

    updateToken: (accessToken) => {
      set({ accessToken });
    },
  };
});
