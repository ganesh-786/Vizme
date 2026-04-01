import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getKeycloak, initKeycloak } from '@/lib/keycloak';
import '@/pages/Auth/Auth.css';

/**
 * Signup route — sends the user straight to Keycloak registration (no intermediate button).
 * After registration / login, Keycloak redirects back to app root.
 */
function Signup() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const redirectStarted = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }
    const kc = getKeycloak();
    if (redirectStarted.current) return;
    redirectStarted.current = true;
    if (kc) {
      kc.register({ redirectUri: `${window.location.origin}/` });
      return;
    }

    initKeycloak().then((freshKc) => {
      freshKc?.register({ redirectUri: `${window.location.origin}/` });
    });
  }, [isAuthenticated, navigate]);

  return (
    <div className="auth-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <p aria-live="polite">Redirecting to create your account…</p>
    </div>
  );
}

export default Signup;
