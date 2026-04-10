import { useAuthStore } from '@/store/authStore';

/**
 * Single forced sign-out path for auth/session expiry.
 * Keeps logout behavior centralized and consistent.
 */
export function forceSessionLogout() {
  try {
    useAuthStore.getState().logout();
  } catch {
    window.location.assign('/login');
  }
}

