import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useToast } from '@/components/ToastContainer';
import Logo from '@/components/Logo';
import Breadcrumbs from '@/components/Breadcrumbs';
import { BellIcon, MoonIcon, SunIcon } from '@/assets/icons';
import Footer from './Footer';
import './Layout.css';

function Layout() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  const avatarLetter = useMemo(() => {
    const email = user?.email || '';
    const first = email.trim()[0];
    return (first ? first : 'U').toUpperCase();
  }, [user?.email]);

  const handleLogout = () => {
    setIsProfileOpen(false);
    logout();
    navigate('/login');
  };

  const handleComingSoon = useCallback(
    (feature) => {
      setIsProfileOpen(false);
      showToast(`${feature} — Coming soon!`, 'info', 2500);
    },
    [showToast]
  );

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsProfileOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsProfileOpen(false);
    }, 200);
  };

  // Close on outside click (for touch / keyboard)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    };
    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setIsProfileOpen(false);
    };
    if (isProfileOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isProfileOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-brand">
            <Logo size="default" />
          </Link>
          <div className="nav-links">
            <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
              Dashboard
            </Link>
            <Link
              to="/metric-configs"
              className={`nav-link ${isActive('/metric-configs') ? 'active' : ''}`}
            >
              Metric Configs
            </Link>
            <Link to="/api-keys" className={`nav-link ${isActive('/api-keys') ? 'active' : ''}`}>
              API Keys
            </Link>
            <Link
              to="/code-generation"
              className={`nav-link ${isActive('/code-generation') ? 'active' : ''}`}
            >
              Code Gen
            </Link>
          </div>
          <div className="nav-user">
            <button
              onClick={toggleTheme}
              className="theme-toggle"
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
            </button>

            <button
              className="icon-button"
              type="button"
              aria-label="Notifications"
              title="Notifications"
            >
              <BellIcon size={20} />
            </button>

            {/* Profile dropdown */}
            <div
              className="profile-dropdown-wrapper"
              ref={profileRef}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                type="button"
                className="avatar"
                aria-label="Account menu"
                aria-expanded={isProfileOpen}
                aria-haspopup="true"
                title={user?.email || 'Account'}
                onClick={() => setIsProfileOpen((prev) => !prev)}
              >
                <span className="avatar-letter" aria-hidden="true">
                  {avatarLetter}
                </span>
              </button>

              {isProfileOpen && (
                <div className="profile-dropdown" role="menu">
                  {/* User info header */}
                  <div className="profile-dropdown-header">
                    <div className="profile-dropdown-avatar">
                      <span className="avatar-letter" aria-hidden="true">
                        {avatarLetter}
                      </span>
                    </div>
                    <div className="profile-dropdown-info">
                      <span className="profile-dropdown-email">
                        {user?.email || 'User'}
                      </span>
                    </div>
                  </div>

                  <div className="profile-dropdown-divider" />

                  {/* Menu items */}
                  <button
                    className="profile-dropdown-item"
                    role="menuitem"
                    onClick={() => handleComingSoon('My Profile')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>My Profile</span>
                    <span className="profile-badge">Soon</span>
                  </button>

                  <button
                    className="profile-dropdown-item"
                    role="menuitem"
                    onClick={() => handleComingSoon('Settings')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <span>Settings</span>
                    <span className="profile-badge">Soon</span>
                  </button>

                  <button
                    className="profile-dropdown-item"
                    role="menuitem"
                    onClick={() => handleComingSoon('Help & Support')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Help & Support</span>
                    <span className="profile-badge">Soon</span>
                  </button>

                  <div className="profile-dropdown-divider" />

                  {/* Logout — functional */}
                  <button
                    className="profile-dropdown-item profile-dropdown-item--danger"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <div className="container">
          <Breadcrumbs />
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default Layout;
