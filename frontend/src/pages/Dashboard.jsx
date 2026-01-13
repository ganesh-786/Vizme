import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { metricConfigsAPI } from '../api/metricConfigs';
import { apiKeysAPI } from '../api/apiKeys';
import GrafanaEmbed from '../components/GrafanaEmbed';
import './Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    metricConfigs: 0,
    apiKeys: 0,
    loading: true
  });
  const token = useAuthStore((state) => state.token);
  const authReady = useAuthStore((state) => state.authReady);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Block until auth is ready AND token exists
    if (!authReady || !token || fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchStats = async () => {
      try {
        const [configsRes, keysRes] = await Promise.all([
          metricConfigsAPI.getAll(),
          apiKeysAPI.getAll()
        ]);

        setStats({
          metricConfigs: configsRes.data?.length || 0,
          apiKeys: keysRes.data?.length || 0,
          loading: false
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        setStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchStats();
  }, [authReady, token]);

  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3000';

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <p>Welcome to your metrics tracking platform. Monitor and analyze your application metrics.</p>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Metric Configurations</h3>
          <p className="stat-value">{stats.loading ? '...' : stats.metricConfigs}</p>
          <Link to="/metric-configs" className="stat-link">Manage →</Link>
        </div>
        
        <div className="stat-card">
          <h3>API Keys</h3>
          <p className="stat-value">{stats.loading ? '...' : stats.apiKeys}</p>
          <Link to="/api-keys" className="stat-link">Manage →</Link>
        </div>
      </div>

      <div className="card">
        <h2>Quick Start</h2>
        <ol className="quick-start-list">
          <li>Create a <Link to="/metric-configs">metric configuration</Link> to define what metrics to collect</li>
          <li>Generate an <Link to="/api-keys">API key</Link> for authentication</li>
          <li>Generate and copy the <Link to="/code-generation">tracking code</Link> to your website</li>
          <li>View your metrics in <a href={grafanaUrl} target="_blank" rel="noopener noreferrer">Grafana</a></li>
        </ol>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2>Grafana Dashboard</h2>
            <p>View and analyze your metrics in Grafana:</p>
          </div>
          <button 
            onClick={() => setShowEmbed(!showEmbed)} 
            className="btn btn-secondary"
          >
            {showEmbed ? 'Hide' : 'Show'} Embedded View
          </button>
        </div>
        
        {showEmbed ? (
          <div style={{ marginTop: '1rem' }}>
            <GrafanaEmbed 
              dashboardUid="metrics-dashboard" 
              theme="light"
              height="800px"
            />
          </div>
        ) : (
          <a 
            href={grafanaUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Open Grafana →
          </a>
        )}
      </div>
    </div>
  );
}

export default Dashboard;

