import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import { authAPI } from "../../api/auth";
import Logo from "../Logo";
import { BellIcon, MoonIcon, SunIcon } from "../../assets/icons";
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

  const handleLogout = async () => {
    // Clear local auth state first
    logout();

    try {
      // Use backend-provided Keycloak logout URL so we fully log out of Keycloak
      const config = await authAPI.getConfig();
      if (config.logoutUrl) {
        window.location.href = config.logoutUrl;
        return;
      }
    } catch (e) {
      // If anything fails, fall back to local logout only
      console.error("Failed to fetch auth config for logout", e);
    }

    // Fallback: send user back to login screen
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
              {theme === "light" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
            </button>

            <button className="icon-button" type="button" aria-label="Notifications" title="Notifications">
              <BellIcon size={20} />
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
