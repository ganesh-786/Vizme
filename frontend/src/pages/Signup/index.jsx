import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getKeycloak } from '@/lib/keycloak';
import Logo from '@/components/Logo';
import '@/pages/Auth/Auth.css';

/**
 * Signup page — Keycloak-only (Step 5 Cutover).
 * Redirects to Keycloak registration; no email/password form.
 */
function Signup() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleKeycloakRegister = () => {
    getKeycloak()?.register();
  };

  return (
    <div className="auth-container">
      <div className="auth-layout">
        <main className="auth-card auth-card--signup" aria-label="Create account">
          <div className="auth-logo">
            <Logo size="large" />
          </div>

          <h1 className="auth-title-hero">Sign Up</h1>
          <p className="auth-subtitle auth-subtitle-lg">
            Join the next generation of engineering analytics.
          </p>

          <button
            type="button"
            className="btn btn-primary auth-cta"
            style={{ width: '100%' }}
            onClick={handleKeycloakRegister}
          >
            Sign up with Keycloak
          </button>

          <div className="auth-divider" role="separator" />
          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </main>

        <div className="auth-terms" aria-label="Terms">
          By clicking &quot;Sign up with Keycloak&quot;, you agree to our{' '}
          <a href="#" onClick={(e) => e.preventDefault()}>
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" onClick={(e) => e.preventDefault()}>
            Privacy Policy
          </a>
          .
        </div>
      </div>
    </div>
  );
}

export default Signup;
