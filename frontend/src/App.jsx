import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Dashboard from '@/pages/Dashboard';
import MetricConfigs, { MetricConfigForm } from '@/pages/MetricConfigs';
import ApiKeys from '@/pages/ApiKeys';
import CodeGeneration from '@/pages/CodeGeneration';
import Sites from '@/pages/Sites';
import DashboardWidgets, { DashboardWidgetForm } from '@/pages/DashboardWidgets';
import Layout from '@/components/Layout';
import { ToastProvider } from '@/components/ToastContainer';
import { ConfirmModalProvider } from '@/components/ConfirmModal';
import '@/App.css';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function App() {
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
              <Route path="sites" element={<Sites />} />
              <Route path="dashboard-widgets" element={<DashboardWidgets />} />
              <Route path="dashboard-widgets/new" element={<DashboardWidgetForm />} />
              <Route path="dashboard-widgets/:id/edit" element={<DashboardWidgetForm isEdit />} />
            </Route>
          </Routes>
        </ConfirmModalProvider>
      </ToastProvider>
    </Router>
  );
}

export default App;
