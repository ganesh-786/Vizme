import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authAPI } from '../api/auth';
import { useToast } from '../components/ToastContainer';
import Logo from '../components/Logo';
import './Auth.css';

function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.signup(email, password, name);
      const { user, accessToken, refreshToken } = response.data;
      
      setAuth(user, accessToken, refreshToken);
      showToast('Account created successfully! Redirecting...', 'success', 2000);
      setTimeout(() => navigate('/'), 500);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Signup failed. Please try again.';
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
          <p className="auth-subtitle auth-subtitle-lg">Join the next generation of engineering analytics.</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
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
              <label className="form-label">Your Email</label>
              <input
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
              <label className="form-label">Password</label>
              <div className="input-with-action">
                <input
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
                  {showPassword ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
                      <path
                        d="M2.1 12c2.1-4.8 6-7.5 9.9-7.5S19.8 7.2 21.9 12c-2.1 4.8-6 7.5-9.9 7.5S4.2 16.8 2.1 12Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
                      <path
                        d="M2.1 12c2.1-4.8 6-7.5 9.9-7.5S19.8 7.2 21.9 12c-2.1 4.8-6 7.5-9.9 7.5S4.2 16.8 2.1 12Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  )}
                </button>
              </div>
              <small className="form-hint">Must be at least 8 characters with one number.</small>
            </div>

            <button type="submit" className="btn btn-primary auth-cta" disabled={loading} style={{ width: '100%' }}>
              <span>{loading ? 'Creating account…' : 'Create Account'}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path
                  d="M5 12h12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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

