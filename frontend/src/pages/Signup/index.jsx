import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/api/auth';
import { useToast } from '@/components/ToastContainer';
import Logo from '@/components/Logo';
import { ArrowRightIcon, EyeIcon, EyeOffIcon } from '@/assets/icons';
import '@/pages/Auth/Auth.css';

function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.signup(email, password, name);
      const { user, accessToken } = response.data;

      setAuth(user, accessToken);
      showToast('Account created successfully! Redirecting...', 'success', 2000);
      const from = location.state?.from;
      const path = from?.pathname;
      const redirectTo =
        path && path !== '/login' && path !== '/signup'
          ? `${path}${from.search || ''}${from.hash || ''}`
          : '/';
      setTimeout(() => navigate(redirectTo, { replace: true }), 500);
    } catch (err) {
      // Handle various error response formats from backend
      const responseData = err.response?.data;
      let errorMsg = 'Signup failed. Please try again.';

      if (responseData) {
        // Try common error message locations
        errorMsg =
          responseData.error ||
          responseData.message ||
          responseData.msg ||
          (typeof responseData === 'string' ? responseData : errorMsg);
      }

      // Map generic status messages to user-friendly messages
      if (err.response?.status === 401 || errorMsg.toLowerCase() === 'unauthorized') {
        errorMsg = 'Invalid credentials. Please try again.';
      } else if (err.response?.status === 409 || errorMsg.toLowerCase().includes('exists')) {
        errorMsg = 'An account with this email already exists.';
      }

      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
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
          <p className="auth-subtitle auth-subtitle-lg">
            Join the next generation of engineering analytics.
          </p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-name">
                Full Name
              </label>
              <input
                id="signup-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                disabled={loading}
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signup-email">
                Your Email
              </label>
              <input
                id="signup-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jeshika@gmail.com"
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signup-password">
                Password
              </label>
              <div className="input-with-action">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="input-action"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                >
                  {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
                </button>
              </div>
              <small className="form-hint">Must be at least 8 characters with one number.</small>
            </div>

            <button
              type="submit"
              className="btn btn-primary auth-cta"
              disabled={loading}
              style={{ width: '100%' }}
            >
              <span>{loading ? 'Creating account…' : 'Create Account'}</span>
              <ArrowRightIcon size={20} />
            </button>
          </form>

          <div className="auth-divider" role="separator" />
          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </main>

        <div className="auth-terms" aria-label="Terms">
          By clicking &quot;Create Account&quot;, you agree to our{' '}
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
