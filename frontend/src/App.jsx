import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/api/auth';
import { initKeycloak, isKeycloakEnabled, userFromKeycloakToken } from '@/lib/keycloak';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Dashboard from '@/pages/Dashboard';
import LiveMetrics from '@/pages/LiveMetrics';
import MetricConfigs, { MetricConfigForm } from '@/pages/MetricConfigs';
import ApiKeys from '@/pages/ApiKeys';
import CodeGeneration from '@/pages/CodeGeneration';
import Sites from '@/pages/Sites';
import DashboardWidgets, { DashboardWidgetForm } from '@/pages/DashboardWidgets';
import NotFound from '@/pages/NotFound';
import Layout from '@/components/Layout';
import { ToastProvider } from '@/components/ToastContainer';
import { ConfirmModalProvider } from '@/components/ConfirmModal';
import '@/App.css';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

/** Auth screens: signed-in users go to intended destination or home */
function GuestRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (isAuthenticated) {
    const from = location.state?.from;
    const path = from?.pathname;
    const target =
      path && path !== '/login' && path !== '/signup'
        ? `${path}${from.search || ''}${from.hash || ''}`
        : '/';
    return <Navigate to={target} replace />;
  }
  return children;
}

function App() {
  const { isAuthenticated, accessToken, refreshToken, authProviderType } = useAuthStore();
  const lastSyncedRef = useRef('');
  const [keycloakReady, setKeycloakReady] = useState(!isKeycloakEnabled());

  useEffect(() => {
    if (!isKeycloakEnabled()) {
      setKeycloakReady(true);
      return;
    }
    initKeycloak().then((kc) => {
      setKeycloakReady(true);
      if (kc?.authenticated) {
        const user = userFromKeycloakToken(kc.tokenParsed);
        if (user) useAuthStore.getState().setKeycloakAuth(user);
      }
    });
  }, []);

  useEffect(() => {
    if (authProviderType !== 'legacy' || !isAuthenticated || !accessToken) {
      lastSyncedRef.current = '';
      return;
    }

    const syncKey = `${accessToken}:${refreshToken || ''}`;
    if (lastSyncedRef.current === syncKey) return;
    lastSyncedRef.current = syncKey;

    authAPI.syncSession(refreshToken).catch(() => {
      // The normal request pipeline can still refresh/recover the session.
    });
  }, [authProviderType, isAuthenticated, accessToken, refreshToken]);

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
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <Login />
                </GuestRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <GuestRoute>
                  <Signup />
                </GuestRoute>
              }
            />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="live-metrics" element={<LiveMetrics />} />
              <Route path="metric-configs" element={<MetricConfigs />} />
              <Route path="metric-configs/new" element={<MetricConfigForm />} />
              <Route path="metric-configs/:id/edit" element={<MetricConfigForm isEdit />} />
              <Route path="api-keys" element={<ApiKeys />} />
              <Route path="code-generation" element={<CodeGeneration />} />
              <Route path="sites" element={<Sites />} />
              <Route path="dashboard-widgets" element={<DashboardWidgets />} />
              <Route path="dashboard-widgets/new" element={<DashboardWidgetForm />} />
              <Route path="dashboard-widgets/:id/edit" element={<DashboardWidgetForm isEdit />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ConfirmModalProvider>
      </ToastProvider>
    </Router>
  );
}

export default App;
