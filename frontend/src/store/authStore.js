import { create } from 'zustand';

// Load from localStorage on init
const loadAuth = () => {
  try {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load auth from localStorage', e);
  }
  return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false };
};

// Save to localStorage
const saveAuth = (state) => {
  try {
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      })
    );
  } catch (e) {
    console.error('Failed to save auth to localStorage', e);
  }
};

export const useAuthStore = create((set) => {
  const initialState = loadAuth();

  return {
    ...initialState,

    setAuth: (user, accessToken, refreshToken) => {
      const newState = {
        user,
        accessToken,
        refreshToken,
        isAuthenticated: true,
      };
      set(newState);
      saveAuth(newState);
    },

    logout: () => {
      const newState = {
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      };
      set(newState);
      localStorage.removeItem('auth-storage');
    },

    updateToken: (accessToken) => {
      const currentState = useAuthStore.getState();
      const newState = { ...currentState, accessToken };
      set(newState);
      saveAuth(newState);
    },
  };
});
