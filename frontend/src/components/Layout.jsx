import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import Logo from "./Logo";
import "./Layout.css";

function Layout() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();

  const avatarLetter = useMemo(() => {
    const email = user?.email || "";
    const first = email.trim()[0];
    return (first ? first : "U").toUpperCase();
  }, [user?.email]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path) => {
    if (path === "/") {
      return location.pathname === "/";
    }
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
            <Link
              to="/"
              className={`nav-link ${isActive("/") ? "active" : ""}`}
            >
              Dashboard
            </Link>
            <Link
              to="/metric-configs"
              className={`nav-link ${
                isActive("/metric-configs") ? "active" : ""
              }`}
            >
              Metric Configs
            </Link>
            <Link
              to="/api-keys"
              className={`nav-link ${isActive("/api-keys") ? "active" : ""}`}
            >
              API Keys
            </Link>
            <Link
              to="/code-generation"
              className={`nav-link ${
                isActive("/code-generation") ? "active" : ""
              }`}
            >
              Code Gen
            </Link>
          </div>
          <div className="nav-user">
            <button
              onClick={toggleTheme}
              className="theme-toggle"
              aria-label="Toggle theme"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
                  <path
                    d="M12 3v2.2M12 18.8V21M4.2 12H3M21 12h-1.2M6 6l-1.6-1.6M19.6 19.6 18 18M18 6l1.6-1.6M4.4 19.6 6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
                  <path
                    d="M21 13.1A7.4 7.4 0 0 1 10.9 3a6.8 6.8 0 1 0 10.1 10.1Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>

            <button className="icon-button" type="button" aria-label="Notifications" title="Notifications">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path
                  d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M13.8 19a1.8 1.8 0 0 1-3.6 0"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <button
              type="button"
              className="avatar"
              aria-label="Account menu"
              title={user?.email || "Account"}
              onClick={handleLogout}
            >
              <span className="avatar-letter" aria-hidden="true">{avatarLetter}</span>
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
