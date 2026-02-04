import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { metricConfigsAPI } from '@/api/metricConfigs';
import { apiKeysAPI } from '@/api/apiKeys';
import { AnalyticsIcon, DocumentIcon, KeyIcon, PlusIcon, TrendUpIcon } from '@/assets/icons';
import './Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    metricConfigs: 0,
    apiKeys: 0,
    loading: true,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [configsRes, keysRes] = await Promise.all([
          metricConfigsAPI.getAll(),
          apiKeysAPI.getAll(),
        ]);

        setStats({
          metricConfigs: configsRes.data?.length || 0,
          apiKeys: keysRes.data?.length || 0,
          loading: false,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        setStats((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchStats();
  }, []);

  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001';

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard Overview</h1>
        <p className="dashboard-subtitle">
          Manage your enterprise telemetry and observability configurations.
        </p>
      </div>

      <div className="overview-grid">
        <div className="overview-card">
          <div>
            <p className="overview-label">Metric Configurations</p>
            <div className="overview-metric">
              <span className="overview-number">{stats.loading ? '…' : stats.metricConfigs}</span>
              <span className="overview-status">Active</span>
            </div>
            <div className="overview-note">
              <span className="status-dot status-dot--good" aria-hidden="true" />
              <p>+2 Draft configurations pending</p>
            </div>
          </div>
          <div className="overview-icon" aria-hidden="true">
            {/* analytics icon */}
            <AnalyticsIcon size={30} />
          </div>
        </div>

        <div className="overview-card">
          <div>
            <p className="overview-label">API Keys</p>
            <div className="overview-metric">
              <span className="overview-number">{stats.loading ? '…' : stats.apiKeys}</span>
              <span className="overview-status">Active</span>
            </div>
            <div className="overview-note overview-note--muted">
              <span className="status-dot" aria-hidden="true" />
              <p>0 Expired keys</p>
            </div>
          </div>
          <div className="overview-icon" aria-hidden="true">
            {/* key icon */}
            <KeyIcon size={30} />
          </div>
        </div>
      </div>

      <section className="quickstart">
        <div className="quickstart-head">
          <h2>Quick Start Guide</h2>
          <span className="quickstart-pill">Engineering Guided Setup</span>
        </div>

        <div className="timeline">
          <div className="timeline-line" aria-hidden="true" />

          <div className="timeline-item">
            <div className="timeline-dot timeline-dot--filled" aria-hidden="true">
              <PlusIcon size={22} />
            </div>
            <div className="timeline-content">
              <h3>Create Metric</h3>
              <p>
                Define your first data source and aggregation logic to start processing telemetry
                data in real-time.
              </p>
              <Link to="/metric-configs" className="primary-inline-btn">
                Configure Source
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <div className="timeline-item">
            <div className="timeline-dot timeline-dot--ring" aria-hidden="true">
              <KeyIcon size={22} />
            </div>
            <div className="timeline-content">
              <h3>Generate Key</h3>
              <p>
                Create a secure API key with scoped permissions for ingestion from your environment.
              </p>
              <Link to="/api-keys" className="text-link">
                Manage API access →
              </Link>
            </div>
          </div>

          <div className="timeline-item">
            <div className="timeline-dot timeline-dot--muted" aria-hidden="true">
              <DocumentIcon size={22} />
            </div>
            <div className="timeline-content">
              <h3>Generate Code</h3>
              <p>
                Copy the SDK initialization snippet and integrate it into your application logic.
              </p>
              <div className="code-snippet">
                <span className="code-accent">vizme.</span>
                <span className="code-fn">init</span>({'{'} apiKey:{' '}
                <span className="code-str">&apos;VZ_LIVE_772...&apos;</span> {'}'})
              </div>
              <Link to="/code-generation" className="text-link">
                Open code generator →
              </Link>
            </div>
          </div>

          <div className="timeline-item">
            <div className="timeline-dot timeline-dot--muted" aria-hidden="true">
              <TrendUpIcon size={22} />
            </div>
            <div className="timeline-content">
              <h3>View in Grafana</h3>
              <p>
                Connect your VIZME endpoint to your Grafana dashboard via our native plugin for
                visualization.
              </p>
              <a href={grafanaUrl} target="_blank" rel="noopener noreferrer" className="text-link">
                Open Grafana →
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="dashboard-footer">
        <div className="footer-left">
          <span className="footer-status">
            <span className="status-dot status-dot--good" aria-hidden="true" /> System Status: All
            Systems Operational
          </span>
          <span className="footer-sep" aria-hidden="true" />
          <span>Region: us-east-1</span>
        </div>
        <div className="footer-right">
          <a href="#" onClick={(e) => e.preventDefault()}>
            Documentation
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Support Portal
          </a>
          <span className="footer-version">v2.4.1-stable</span>
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
