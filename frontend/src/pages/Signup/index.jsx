import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../../api/auth';
import { useToast } from '../../components/ToastContainer';
import Logo from '../../components/Logo';
import { ArrowRightIcon } from '../../assets/icons';
import '../Auth/Auth.css';

function Signup() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  // After Keycloak logout we land on /signup?then=register; redirect to registration page
  useEffect(() => {
    const thenRegister = searchParams.get('then') === 'register';
    if (!thenRegister) return;
    let cancelled = false;
    authAPI
      .getConfig()
      .then((config) => {
        if (!cancelled && config.registerUrl) window.location.href = config.registerUrl;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams]);

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const config = await authAPI.getConfig();
      // Redirect to Keycloak user registration (enable "User registration" in realm Login settings)
      window.location.href = config.registerUrl;
    } catch (err) {
      const isNetworkError = err.message === 'Network Error' || err.code === 'ERR_NETWORK' || !err.response;
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const errorMsg = isNetworkError
        ? `Cannot connect to the API at ${apiUrl}. Make sure the backend is running.`
        : (err.response?.data?.message || err.message || 'Could not load sign-up. Try again.');
      setError(errorMsg);
      showToast(errorMsg, 'error');
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-layout">
        <main className="auth-card auth-card--signup" aria-label="Create account">
          <div className="auth-logo">
            <Logo size="large" />
          </div>

          <h1 className="auth-title-hero">Sign Up</h1>
          <p className="auth-subtitle auth-subtitle-lg">Join the next generation of engineering analytics.</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSignUp}>
            <button type="submit" className="btn btn-primary auth-cta" disabled={loading} style={{ width: '100%' }}>
              <span>{loading ? 'Redirecting…' : 'Sign up with Keycloak'}</span>
              <ArrowRightIcon size={20} />
            </button>
          </form>

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
