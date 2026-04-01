import { create } from 'zustand';

const THEME_COOKIE = 'theme-preference';
const COOKIE_MAX_AGE = 31536000; // 1 year

const getThemeCookie = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
};

const setThemeCookie = (theme) => {
  if (typeof document === 'undefined') return;
  try {
    const domain = import.meta.env.VITE_THEME_COOKIE_DOMAIN;
    let cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    if (domain) cookie += `; Domain=${domain}`;
    document.cookie = cookie;
  } catch (e) {
    console.error('Failed to set theme cookie', e);
  }
};

// Cookie (e.g. set on Keycloak login) → localStorage → system
const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';

  const cookie = getThemeCookie();
  if (cookie === 'dark' || cookie === 'light') {
    return cookie;
  }

  try {
    const stored = localStorage.getItem('theme-preference');
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch (e) {
    console.error('Failed to load theme from localStorage', e);
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const saveTheme = (theme) => {
  try {
    localStorage.setItem('theme-preference', theme);
  } catch (e) {
    console.error('Failed to save theme to localStorage', e);
  }
  setThemeCookie(theme);
};

export const useThemeStore = create((set) => {
  const initialTheme = getInitialTheme();

  // Initialize theme on load; align localStorage when cookie was the source
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-theme', initialTheme);
    const fromCookie = getThemeCookie();
    if (fromCookie === 'dark' || fromCookie === 'light') {
      try {
        localStorage.setItem('theme-preference', initialTheme);
      } catch {
        /* ignore */
      }
    }
  }

  return {
    theme: initialTheme,

    toggleTheme: () => {
      set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        saveTheme(newTheme);
        return { theme: newTheme };
      });
    },

    setTheme: (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      saveTheme(theme);
      set({ theme });
    },
  };
});
