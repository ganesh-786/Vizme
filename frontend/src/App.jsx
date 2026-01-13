import { useEffect, useState, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { initKeycloak, isAuthenticated, getToken } from './services/keycloak';
import { authAPI } from './api/auth';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import MetricConfigs from './pages/MetricConfigs';
import ApiKeys from './pages/ApiKeys';
import CodeGeneration from './pages/CodeGeneration';
import Layout from './components/Layout';
import { ToastProvider } from './components/ToastContainer';
import './App.css';

function PrivateRoute({ children }) {
  const isAuthenticatedStore = useAuthStore((state) => state.isAuthenticated);
  const authReady = useAuthStore((state) => state.authReady);
  
  // Show loading while Keycloak initializes
  if (!authReady) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }
  
  // Simple check: if store says authenticated, allow access
  if (isAuthenticatedStore) {
    return children;
  }
  
  // Not authenticated - redirect to login
  return <Navigate to="/login" replace />;
}

function App() {
  const [appReady, setAppReady] = useState(false);
  const { setAuth, syncWithKeycloak, setAuthReady } = useAuthStore();
  const initRef = useRef(false);

  useEffect(() => {
    // Guard against double-invocation
    if (initRef.current) return;
    initRef.current = true;

    // Initialize Keycloak
    initKeycloak(async () => {
      // This callback runs when user is authenticated via Keycloak
      if (isAuthenticated()) {
        const token = getToken();
        if (token) {
          try {
            // Sync user with backend
            const response = await authAPI.callback(token);
            setAuth(response.user, token);
          } catch (error) {
            console.error('Failed to sync user with backend:', error);
            // Backend sync failed, but user is still authenticated via Keycloak
            syncWithKeycloak();
          }
        }
      }
    }).then(async () => {
      // CRITICAL FIX: Add small delay to ensure React state is fully propagated
      // This prevents race condition between Zustand update and Router render
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now set ready states - Router will render AFTER state is stable
      setAuthReady(true);
      setAppReady(true);
    }).catch((error) => {
      console.error('Keycloak initialization error:', error);
      setAuthReady(true);
      setAppReady(true);
    });
  }, [setAuth, syncWithKeycloak, setAuthReady]);

  // Don't render anything until Keycloak has fully initialized AND state is stable
  if (!appReady) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="metric-configs" element={<MetricConfigs />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="code-generation" element={<CodeGeneration />} />
          </Route>
        </Routes>
      </ToastProvider>
    </Router>
  );
}

export default App;
