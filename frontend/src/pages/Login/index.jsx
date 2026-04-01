import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getKeycloak, initKeycloak } from '@/lib/keycloak';
import '@/pages/Auth/Auth.css';

/**
 * Login route — sends the user straight to Keycloak sign-in (no intermediate button).
 * After auth, Keycloak redirects back to app root.
 */
function Login() {
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
      kc.login({ redirectUri: `${window.location.origin}/` });
      return;
    }

    // Recover from transient adapter init failures (e.g. after logout redirect).
    initKeycloak().then((freshKc) => {
      freshKc?.login({ redirectUri: `${window.location.origin}/` });
    });
  }, [isAuthenticated, navigate]);

  return (
    <div className="auth-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <p aria-live="polite">Redirecting to sign in…</p>
    </div>
  );
}

export default Login;
