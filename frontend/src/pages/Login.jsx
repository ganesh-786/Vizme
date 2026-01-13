import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/keycloak';
import { useAuthStore } from '../store/authStore';
import './Auth.css';

function Login() {
  const navigate = useNavigate();
  const isAuthenticatedStore = useAuthStore((state) => state.isAuthenticated);
  const authReady = useAuthStore((state) => state.authReady);

  // Redirect to dashboard if already authenticated
  // CRITICAL: Only use Zustand store, NOT direct Keycloak check
  // Direct Keycloak check causes race condition with store updates
  useEffect(() => {
    if (authReady && isAuthenticatedStore) {
      navigate('/', { replace: true });
    }
  }, [authReady, isAuthenticatedStore, navigate]);

  const handleLogin = () => {
    login();
  };

  // Don't show login form if already authenticated
  if (authReady && isAuthenticatedStore) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Sign In</h1>
        <p className="auth-subtitle">Welcome back! Please sign in to your account.</p>
        
        <button
          type="button"
          onClick={handleLogin}
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '20px' }}
        >
          Sign In with Keycloak
        </button>
        
        <p className="auth-footer" style={{ marginTop: '20px' }}>
          Secure authentication powered by Keycloak
        </p>
      </div>
    </div>
  );
}

export default Login;
