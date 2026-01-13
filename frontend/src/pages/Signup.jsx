import { Link } from 'react-router-dom';
import { register } from '../services/keycloak';
import './Auth.css';

function Signup() {
  const handleSignup = async () => {
    try {
      await register();
      // Keycloak will handle the redirect after registration
    } catch (error) {
      console.error('Signup failed:', error);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Sign Up</h1>
        <p className="auth-subtitle">Create your account to get started.</p>
        
        <button
          type="button"
          onClick={handleSignup}
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '20px' }}
        >
          Sign Up with Keycloak
        </button>
        
        <p className="auth-footer" style={{ marginTop: '20px' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;
