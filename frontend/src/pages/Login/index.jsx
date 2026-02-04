import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../../api/auth';
import { useToast } from '../../components/ToastContainer';
import Logo from '../../components/Logo';
import '../Auth/Auth.css';

function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const config = await authAPI.getConfig();
      window.location.href = config.loginUrl;
    } catch (err) {
      const isNetworkError = err.message === 'Network Error' || err.code === 'ERR_NETWORK' || !err.response;
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const errorMsg = isNetworkError
        ? `Cannot connect to the API at ${apiUrl}. Make sure the backend is running.`
        : (err.response?.data?.message || err.message || 'Could not load sign-in. Try again.');
      setError(errorMsg);
      showToast(errorMsg, 'error');
      setLoading(false);
    }
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

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSignIn}>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Redirecting…' : 'Sign in with Keycloak'}
            </button>
          </form>

          <p className="auth-footer">
            Don’t have an account? <Link to="/signup">Sign up</Link>
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
