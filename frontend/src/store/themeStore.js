import { create } from 'zustand';

// Load theme preference from localStorage or system preference
const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';
  
  try {
    const stored = localStorage.getItem('theme-preference');
    if (stored) {
      return stored;
    }
  } catch (e) {
    console.error('Failed to load theme from localStorage', e);
  }
  
  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

// Save to localStorage
const saveTheme = (theme) => {
  try {
    localStorage.setItem('theme-preference', theme);
  } catch (e) {
    console.error('Failed to save theme to localStorage', e);
  }
};

export const useThemeStore = create((set) => {
  const initialTheme = getInitialTheme();
  
  // Initialize theme on load
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-theme', initialTheme);
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
    }
  };
});
