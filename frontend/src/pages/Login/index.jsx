import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/api/auth';
import { useToast } from '@/components/ToastContainer';
import Logo from '@/components/Logo';
import { EyeIcon, EyeOffIcon } from '@/assets/icons';
import '@/pages/Auth/Auth.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [hasLoginError, setHasLoginError] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { showToast } = useToast();

  // Clear error state when user starts typing
  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (hasLoginError) {
      setHasLoginError(false);
      setError('');
    }
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (hasLoginError) {
      setHasLoginError(false);
      setError('');
    }
  };

  // Parse and format error messages professionally
  const getErrorMessage = (err) => {
    const serverError = err.response?.data?.error;
    const statusCode = err.response?.status;

    // Handle specific error cases
    if (statusCode === 401 || serverError?.toLowerCase().includes('invalid')) {
      return {
        message: 'Invalid email or password. Please check your credentials and try again.',
        toastMessage: 'Login failed: Invalid email or password'
      };
    }

    if (statusCode === 429) {
      return {
        message: 'Too many login attempts. Please wait a moment before trying again.',
        toastMessage: 'Too many attempts. Please wait and try again.'
      };
    }

    if (statusCode === 400) {
      return {
        message: 'Please enter a valid email address and password.',
        toastMessage: 'Please check your email and password format'
      };
    }

    if (!err.response) {
      return {
        message: 'Unable to connect to the server. Please check your internet connection.',
        toastMessage: 'Connection error. Please check your internet.'
      };
    }

    return {
      message: serverError || 'Login failed. Please try again.',
      toastMessage: serverError || 'Login failed. Please try again.'
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setHasLoginError(false);
    setLoading(true);

    try {
      const response = await authAPI.signin(email, password);
      const { user, accessToken, refreshToken } = response.data;
      
      setAuth(user, accessToken, refreshToken);
      showToast('Welcome back! Redirecting...', 'success', 2000);
      setTimeout(() => navigate('/'), 500);
    } catch (err) {
      const { message, toastMessage } = getErrorMessage(err);
      setError(message);
      setHasLoginError(true);
      showToast(toastMessage, 'error', 4000);
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
                className={`form-input ${hasLoginError ? 'form-input--error' : ''}`}
                value={email}
                onChange={handleEmailChange}
                placeholder="jeshika@gmail.com"
                required
                disabled={loading}
                autoComplete="email"
                aria-invalid={hasLoginError}
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
                  className={`form-input ${hasLoginError ? 'form-input--error' : ''}`}
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  aria-invalid={hasLoginError}
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
