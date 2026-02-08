import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Callback from '@/pages/Callback';
import Dashboard from '@/pages/Dashboard';
import MetricConfigs from '@/pages/MetricConfigs';
import ApiKeys from '@/pages/ApiKeys';
import CodeGeneration from '@/pages/CodeGeneration';
import Layout from '@/components/Layout';
import { ToastProvider } from '@/components/ToastContainer';
import './App.css';

/** If Keycloak redirected to / or /login with ?code=..., send user to /callback so the code is processed. */
function RedirectCodeToCallback({ children }) {
  const location = useLocation();
  const search = location.search || '';
  if (search.includes('code=') && (location.pathname === '/' || location.pathname === '/login')) {
    return <Navigate to={'/callback' + search} replace />;
  }
  return children;
}

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <Router>
      <ToastProvider>
        <RedirectCodeToCallback>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/callback" element={<Callback />} />
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
        </RedirectCodeToCallback>
      </ToastProvider>
    </Router>
  );
}

export default App;
