import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authAPI } from '../../api/auth';
import { useToast } from '../../components/ToastContainer';
import Logo from '../../components/Logo';
import { EyeIcon, EyeOffIcon } from '../../assets/icons';
import '../Auth/Auth.css';

function Login() {
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
      const response = await authAPI.signin(email, password);
      const { user, accessToken, refreshToken } = response.data;
      
      setAuth(user, accessToken, refreshToken);
      showToast('Welcome back! Redirecting...', 'success', 2000);
      setTimeout(() => navigate('/'), 500);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Login failed. Please try again.';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
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

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
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
              <div className="form-label-row">
                <label className="form-label">Password</label>
                <a
                  className="auth-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    showToast('Password reset is coming soon.', 'info');
                  }}
                >
                  Forgot password?
                </a>
              </div>

              <div className="input-with-action">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  autoComplete="current-password"
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
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Signing in...' : 'Sign In'}
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
