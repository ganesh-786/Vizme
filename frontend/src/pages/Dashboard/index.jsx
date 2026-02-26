import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { metricConfigsAPI } from '@/api/metricConfigs';
import { apiKeysAPI } from '@/api/apiKeys';
import { onboardingAPI } from '@/api/onboarding';
import {
  AnalyticsIcon,
  CheckIcon,
  DocumentIcon,
  KeyIcon,
  PlusIcon,
  RocketIcon,
  ShieldIcon,
  TrendUpIcon,
} from '@/assets/icons';
import { Skeleton } from '@/components/Skeleton';
import { GrafanaEmbed } from '@/components/GrafanaEmbed';
import client from '@/api/client';
import './Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    metricConfigs: 0,
    apiKeys: 0,
    loading: true,
  });
  const [onboarding, setOnboarding] = useState({
    loading: true,
    is_setup_complete: false,
    has_metric_configs: false,
    has_api_key: false,
    onboarding_completed_at: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [configsRes, keysRes, onboardingRes] = await Promise.all([
          metricConfigsAPI.getAll(),
          apiKeysAPI.getAll(),
          onboardingAPI.getStatus(),
        ]);

        setStats({
          metricConfigs: Array.isArray(configsRes)
            ? configsRes.length
            : (configsRes?.data?.length ?? 0),
          apiKeys: Array.isArray(keysRes) ? keysRes.length : (keysRes?.data?.length ?? 0),
          loading: false,
        });

        setOnboarding({
          loading: false,
          ...(onboardingRes.data || {}),
        });
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setStats((prev) => ({ ...prev, loading: false }));
        setOnboarding((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchData();
  }, []);

  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL;

  const handleOpenGrafana = async (e) => {
    e.preventDefault();
    try {
      //set the Grafana session cookie via backend
      await client.post('/auth/grafana-session', {}, { withCredentials: true });
      //redirect to the Grafana through Nginx proxy
      window.open(grafanaUrl, '_blank');
    } catch (error) {
      console.error('Failed to open Grafana:', error);
      toast.error('Failed to open Grafana');
    }
  };

  // Determine which Quick-Start steps are completed
  const step1Done = onboarding.has_metric_configs;
  const step2Done = onboarding.has_api_key;
  const step3Done = onboarding.onboarding_completed_at !== null;
  const allDone = onboarding.is_setup_complete;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard Overview</h1>
        <p className="dashboard-subtitle">
          Manage your enterprise telemetry and observability configurations.
        </p>
      </div>

      {/* ── Setup Complete Banner ────────────────────────────────────── */}
      {!onboarding.loading && allDone && (
        <div className="setup-complete-banner">
          <div className="setup-complete-icon">
            <ShieldIcon size={28} />
          </div>
          <div className="setup-complete-content">
            <h3 className="setup-complete-title">Setup Complete</h3>
            <p className="setup-complete-text">
              Your API key and tracking snippet are active. All metrics — current and future — are
              automatically covered by your single API key. No additional setup needed when you
              create new metric configurations.
            </p>
          </div>
          <Link to="/api-keys" className="setup-complete-link">
            View API Key →
          </Link>
        </div>
      )}

      <div className="overview-grid">
        <div className="overview-card">
          <div>
            <p className="overview-label">Metric Configurations</p>
            <div className="overview-metric">
              <span className="overview-number">
                {stats.loading ? (
                  <Skeleton inline width="48px" height="2.5rem" />
                ) : (
                  stats.metricConfigs
                )}
              </span>
              <span className="overview-status">Active</span>
            </div>
            <div className="overview-note">
              <span className="status-dot status-dot--good" aria-hidden="true" />
              <p>All covered by your API key</p>
            </div>
          </div>
          <div className="overview-icon" aria-hidden="true">
            <AnalyticsIcon size={30} />
          </div>
        </div>

        <div className="overview-card">
          <div>
            <p className="overview-label">API Key</p>
            <div className="overview-metric">
              <span className="overview-number">
                {stats.loading ? (
                  <Skeleton inline width="48px" height="2.5rem" />
                ) : step2Done ? (
                  '1'
                ) : (
                  '0'
                )}
              </span>
              <span className="overview-status">{step2Done ? 'Active' : 'Not Created'}</span>
            </div>
            <div className={`overview-note ${step2Done ? '' : 'overview-note--muted'}`}>
              <span
                className={`status-dot ${step2Done ? 'status-dot--good' : ''}`}
                aria-hidden="true"
              />
              <p>{step2Done ? 'Covers all metrics' : 'Generate to get started'}</p>
            </div>
          </div>
          <div className="overview-icon" aria-hidden="true">
            <KeyIcon size={30} />
          </div>
        </div>
      </div>

      {/* ── Quick Start Guide (shows progress for returning users) ──── */}
      <section className="quickstart">
        <div className="quickstart-head">
          <h2>Quick Start Guide</h2>
          <span className="quickstart-pill">
            {allDone ? 'Setup Complete' : 'Engineering Guided Setup'}
          </span>
        </div>

        <div className="timeline">
          <div className="timeline-line" aria-hidden="true" />

          {/* Step 1: Create Metric */}
          <div className="timeline-item">
            <div
              className={`timeline-dot ${step1Done ? 'timeline-dot--filled' : 'timeline-dot--ring'}`}
              aria-hidden="true"
            >
              {step1Done ? <CheckIcon size={22} /> : <PlusIcon size={22} />}
            </div>
            <div className="timeline-content">
              <h3>Create Metric {step1Done && <span className="step-done-badge">Done</span>}</h3>
              <p>
                Define your first data source and aggregation logic to start processing telemetry
                data in real-time.
              </p>
              <Link to="/metric-configs" className={step1Done ? 'text-link' : 'primary-inline-btn'}>
                {step1Done ? (
                  'Manage Configurations →'
                ) : (
                  <>
                    Configure Source <span aria-hidden="true">→</span>
                  </>
                )}
              </Link>
            </div>
          </div>

          {/* Step 2: Generate Key */}
          <div className="timeline-item">
            <div
              className={`timeline-dot ${step2Done ? 'timeline-dot--filled' : step1Done ? 'timeline-dot--ring' : 'timeline-dot--muted'}`}
              aria-hidden="true"
            >
              {step2Done ? <CheckIcon size={22} /> : <KeyIcon size={22} />}
            </div>
            <div className="timeline-content">
              <h3>Generate Key {step2Done && <span className="step-done-badge">Done</span>}</h3>
              <p>
                {step2Done
                  ? 'Your single API key is active and covers all metrics automatically.'
                  : 'Create a secure API key for ingestion from your environment.'}
              </p>
              <Link to="/api-keys" className="text-link">
                {step2Done ? 'View API Key →' : 'Generate API Key →'}
              </Link>
            </div>
          </div>

          {/* Step 3: Generate Code */}
          <div className="timeline-item">
            <div
              className={`timeline-dot ${step3Done ? 'timeline-dot--filled' : step2Done ? 'timeline-dot--ring' : 'timeline-dot--muted'}`}
              aria-hidden="true"
            >
              {step3Done ? <CheckIcon size={22} /> : <DocumentIcon size={22} />}
            </div>
            <div className="timeline-content">
              <h3>Generate Code {step3Done && <span className="step-done-badge">Done</span>}</h3>
              <p>
                {step3Done
                  ? 'Your tracking snippet is ready. The same code works for all metrics.'
                  : 'Copy the SDK initialization snippet and integrate it into your application logic.'}
              </p>
              {!step3Done && (
                <div className="code-snippet">
                  <span className="code-accent">vizme.</span>
                  <span className="code-fn">init</span>({'{'} apiKey:{' '}
                  <span className="code-str">&apos;mk_a4b2...&apos;</span> {'}'})
                </div>
              )}
              <Link to="/code-generation" className="text-link">
                {step3Done ? 'View Snippet →' : 'Open code generator →'}
              </Link>
            </div>
          </div>

          {/* Step 4: View in Grafana */}
          <div className="timeline-item">
            <div
              className={`timeline-dot ${allDone ? 'timeline-dot--ring' : 'timeline-dot--muted'}`}
              aria-hidden="true"
            >
              <TrendUpIcon size={22} />
            </div>
            <div className="timeline-content">
              <h3>View in Grafana</h3>
              <p>
                Connect your VIZME endpoint to your Grafana dashboard via our native plugin for
                visualization.
              </p>
              <a href="#" onClick={handleOpenGrafana} className="text-link">
                Open Grafana →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Live Metrics Visualization Section */}
      <section className="metrics-visualization">
        <div className="metrics-visualization__header">
          <div>
            <h2>Live Metrics</h2>
            <p className="metrics-visualization__subtitle">
              Real-time telemetry data from your connected applications
            </p>
          </div>
          <a href="#" onClick={handleOpenGrafana} className="metrics-visualization__link">
            Open Full Dashboard →
          </a>
        </div>
        {/* 
        <div className="metrics-visualization__container">
          <GrafanaEmbed
            dashboardUid="metrics"
            from="now-1h"
            to="now"
            refresh="10s"
            height={450}
            title="Vizme Metrics Dashboard"
            kiosk={true}
          />
        </div> */}

        <p className="metrics-visualization__hint">
          Not seeing data? Make sure you have configured metrics and integrated the tracking code.
        </p>
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
