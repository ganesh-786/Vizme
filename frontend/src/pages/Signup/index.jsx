import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authAPI } from '../../api/auth';
import { useToast } from '../../components/ToastContainer';
import Logo from '../../components/Logo';
import { ArrowRightIcon, EyeIcon, EyeOffIcon } from '../../assets/icons';
import '../Auth/Auth.css';

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
                  {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
                </button>
              </div>
              <small className="form-hint">Must be at least 8 characters with one number.</small>
            </div>

            <button type="submit" className="btn btn-primary auth-cta" disabled={loading} style={{ width: '100%' }}>
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
