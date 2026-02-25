import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getKeycloak } from '@/lib/keycloak';
import Logo from '@/components/Logo';
import '@/pages/Auth/Auth.css';

/**
 * Login page — Keycloak-only (Step 5 Cutover).
 * Redirects to Keycloak for sign-in; no email/password form.
 */
function Login() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleKeycloakLogin = () => {
    getKeycloak()?.login();
  };

  return (
    <div className="auth-container">
      <div className="auth-layout">
        <div className="auth-card">
          <div className="auth-logo">
            <Logo size="large" />
          </div>

          <h1>Sign in to your account</h1>
          <p className="auth-subtitle">Welcome back to your analytics dashboard</p>

          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleKeycloakLogin}
          >
            Sign in with Keycloak
          </button>

          <p className="auth-footer">
            Don&apos;t have an account? <Link to="/signup">Sign up</Link>
          </p>
        </div>

        <div className="auth-legal" aria-label="Legal links">
          <a href="#" onClick={(e) => e.preventDefault()}>
            Privacy Policy
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Terms of Service
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Security
          </a>
        </div>
      </div>
    </div>
  );
}

export default Login;
