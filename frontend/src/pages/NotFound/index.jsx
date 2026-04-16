import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import Logo from '@/components/Logo';
import '@/pages/Auth/Auth.css';

const TITLE = 'Page not found · Vizme';

function NotFound() {
  useEffect(() => {
    const prev = document.title;
    document.title = TITLE;
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="auth-container">
      <div className="auth-layout">
        <main className="auth-card" aria-labelledby="not-found-title">
          <div className="auth-logo">
            <Logo size="large" />
          </div>
          <h1 id="not-found-title" className="auth-title-hero">
            Page not found
          </h1>
          <p className="auth-subtitle auth-subtitle-lg">
            The URL may be mistyped, or the page may have moved.
          </p>
          <p className="auth-footer" style={{ marginTop: '1.5rem' }}>
            <Link
              to="/"
              className="btn btn-primary"
              style={{ display: 'inline-block', width: 'auto', padding: '0.65rem 1.25rem' }}
            >
              Back to dashboard
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}

export default NotFound;
