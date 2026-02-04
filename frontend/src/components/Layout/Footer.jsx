import { Link } from 'react-router-dom';
import './Footer.css';

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="footer-logo">Vizme</span>
            <p className="footer-tagline">Analytics made simple</p>
          </div>

          <nav className="footer-links">
            <Link to="/" className="footer-link">
              Dashboard
            </Link>
            <Link to="/metric-configs" className="footer-link">
              Metric Configs
            </Link>
            <Link to="/api-keys" className="footer-link">
              API Keys
            </Link>
            <Link to="/code-generation" className="footer-link">
              Code Gen
            </Link>
          </nav>
        </div>

        <div className="footer-bottom">
          <p className="footer-copyright">
            &copy; {currentYear} Vizme. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
