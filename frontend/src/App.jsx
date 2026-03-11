import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { initKeycloak, userFromKeycloakToken } from '@/lib/keycloak';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Dashboard from '@/pages/Dashboard';
import MetricConfigs, { MetricConfigForm } from '@/pages/MetricConfigs';
import ApiKeys from '@/pages/ApiKeys';
import CodeGeneration from '@/pages/CodeGeneration';
import Layout from '@/components/Layout';
import { ToastProvider } from '@/components/ToastContainer';
import { ConfirmModalProvider } from '@/components/ConfirmModal';
import '@/App.css';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function App() {
  const [keycloakReady, setKeycloakReady] = useState(false);

  useEffect(() => {
    initKeycloak().then((kc) => {
      setKeycloakReady(true);
      if (kc?.authenticated) {
        const user = userFromKeycloakToken(kc.tokenParsed);
        if (user) useAuthStore.getState().setKeycloakAuth(user);
      }
    });
  }, []);

  if (!keycloakReady) {
    return (
      <div className="auth-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p aria-live="polite">Loading…</p>
      </div>
    );
  }

  return (
    <Router>
      <ToastProvider>
        <ConfirmModalProvider>
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
            <Route path="metric-configs/new" element={<MetricConfigForm />} />
            <Route path="metric-configs/:id/edit" element={<MetricConfigForm isEdit />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="code-generation" element={<CodeGeneration />} />
          </Route>
        </Routes>
        </ConfirmModalProvider>
      </ToastProvider>
    </Router>
  );
}

export default App;
