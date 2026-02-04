import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authAPI } from '../../api/auth';
import { useToast } from '../../components/ToastContainer';
import Logo from '../../components/Logo';
import '../Auth/Auth.css';

function Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens, setAuth } = useAuthStore();
  const { showToast } = useToast();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const hasRun = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('No authorization code received. Please try signing in again.');
      setLoading(false);
      return;
    }
    if (hasRun.current) return;
    hasRun.current = true;

    const run = async () => {
      try {
        const config = await authAPI.getConfig();
        const redirectUri = config.redirectUri || `${window.location.origin}/callback`;
        const { access_token, refresh_token } = await authAPI.exchangeCodeForTokens(code, redirectUri);
        setTokens(access_token, refresh_token);
        const { user } = await authAPI.getMeWithToken(access_token);
        setAuth(user, access_token, refresh_token);
        showToast('Signed in successfully!', 'success', 2000);
        navigate('/', { replace: true });
      } catch (err) {
        const msg =
          err.response?.data?.error_description ||
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Sign-in failed.';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [searchParams, setTokens, setAuth, navigate, showToast]);

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-layout">
          <div className="auth-card">
            <div className="auth-logo">
              <Logo size="large" />
            </div>
            <h1>Signing you in…</h1>
            <p className="auth-subtitle">Completing sign-in with Keycloak</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-container">
        <div className="auth-layout">
          <div className="auth-card">
            <div className="auth-logo">
              <Logo size="large" />
            </div>
            <h1>Sign-in failed</h1>
            <p className="auth-subtitle">{error}</p>
            <a href="/login" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
              Back to Sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default Callback;
