import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import './Layout.css';

function Layout() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-brand">
            <span className="brand-icon">📊</span>
            <span>Metrics Tracker</span>
          </Link>
          <div className="nav-links">
            <Link 
              to="/" 
              className={`nav-link ${isActive('/') ? 'active' : ''}`}
            >
              Dashboard
            </Link>
            <Link 
              to="/metric-configs" 
              className={`nav-link ${isActive('/metric-configs') ? 'active' : ''}`}
            >
              Metric Configs
            </Link>
            <Link 
              to="/api-keys" 
              className={`nav-link ${isActive('/api-keys') ? 'active' : ''}`}
            >
              API Keys
            </Link>
            <Link 
              to="/code-generation" 
              className={`nav-link ${isActive('/code-generation') ? 'active' : ''}`}
            >
              Code Generation
            </Link>
          </div>
          <div className="nav-user">
            <button 
              onClick={toggleTheme} 
              className="theme-toggle"
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <span className="user-email">{user?.email}</span>
            <button onClick={handleLogout} className="btn btn-secondary">
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;

