import './Logo.css';

function Logo({ className = '', size = 'default' }) {
  return (
    <div className={`logo-container ${className} logo-${size}`} role="img" aria-label="Vizme Logo">
      <div className="logo-wrapper">
      {/* Light mode logo - shown in light theme */}
      <img 
        src="/logo-light.png" 
          alt="Vizme - Visualize Data" 
        className="logo-image logo-light"
        loading="eager"
          width="auto"
          height="auto"
        onError={(e) => {
          // Hide if image fails to load
          e.target.style.display = 'none';
        }}
      />
      {/* Dark mode logo - shown in dark theme */}
      <img 
        src="/logo-dark.png" 
          alt="Vizme - Visualize Data" 
        className="logo-image logo-dark"
        loading="eager"
          width="auto"
          height="auto"
        onError={(e) => {
          // Hide if image fails to load
          e.target.style.display = 'none';
        }}
      />
      </div>
    </div>
  );
}

export default Logo;

