import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { codeGenerationAPI } from '@/api/codeGeneration';
import { apiKeysAPI } from '@/api/apiKeys';
import { metricConfigsAPI } from '@/api/metricConfigs';
import { useToast } from '@/components/ToastContainer';
import ProgressStepper from '@/components/ProgressStepper';
import { CheckIcon, RefreshIcon, CopyIcon, ArrowBackIcon, RocketIcon } from '@/assets/icons';
import CodeGenerationSkeleton from './CodeGenerationSkeleton';
import './CodeGeneration.css';

const FRAMEWORKS = [
  { id: 'javascript', label: 'JavaScript', icon: 'JS' },
  { id: 'html', label: 'HTML', icon: 'HTML' },
  { id: 'react', label: 'React', icon: '{ }' },
  { id: 'vue', label: 'Vue', icon: '◇' },
  { id: 'angular', label: 'Angular', icon: '▲' },
];

function CodeGeneration() {
  const navigate = useNavigate();
  const [selectedFramework, setSelectedFramework] = useState('javascript');
  const [autoPageViews, setAutoPageViews] = useState(true);
  const [scrollDepth, setScrollDepth] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('not_detected');
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Data states
  const [apiKeys, setApiKeys] = useState([]);
  const [metricConfigs, setMetricConfigs] = useState([]);
  const [selectedApiKey, setSelectedApiKey] = useState(null);
  const [selectedMetricConfig, setSelectedMetricConfig] = useState(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState('');

  const { showToast } = useToast();

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    setError('');
    try {
      const [keysRes, configsRes] = await Promise.all([
        apiKeysAPI.getAll(),
        metricConfigsAPI.getAll(),
      ]);

      const keys = keysRes.data || [];
      // metricConfigsAPI.getAll() returns an unwrapped array, not { data: [] }
      const configs = Array.isArray(configsRes) ? configsRes : (configsRes?.data || []);

      setApiKeys(keys);
      setMetricConfigs(configs);

      // Auto-select first active API key
      const activeKey = keys.find((k) => k.is_active);
      if (activeKey) {
        setSelectedApiKey(activeKey);
      }

      // Auto-select first metric config (current metric)
      if (configs.length > 0) {
        setSelectedMetricConfig(configs[0]);
      }
    } catch (err) {
      setError('Failed to fetch configuration data');
      showToast('Failed to load configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Generate code automatically when selections change
  const generateCode = useCallback(async () => {
    if (!selectedApiKey) {
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const response = await codeGenerationAPI.generate(
        selectedApiKey.id,
        selectedMetricConfig?.id || null,
        { autoTrack: autoPageViews, customEvents: true }
      );

      setGeneratedCode(response.data.code);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to generate code';
      setError(errorMsg);
      // Fallback to template if backend fails
      setGeneratedCode(getFallbackSnippet());
    } finally {
      setGenerating(false);
    }
  }, [selectedApiKey, selectedMetricConfig, autoPageViews]);

  // Auto-generate code when API key or metric config is selected
  useEffect(() => {
    if (selectedApiKey) {
      generateCode();
    }
  }, [selectedApiKey, selectedMetricConfig, autoPageViews, generateCode]);

  // Fallback snippet template if backend is unavailable
  const getFallbackSnippet = () => {
    const appId = selectedApiKey?.masked_key || 'vz_your_api_key';
    return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'start':Date.now()});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='http://localhost:3000/api/v1/tracker.js?k=${encodeURIComponent(appId)}&a=${autoPageViews ? '1' : '0'}&c=1';f.parentNode.insertBefore(j,f);})(window,document,'script','metricsTracker');`;
  };

  // Get framework-specific wrapper for the generated code
  const getFrameworkCode = () => {
    const snippet = generatedCode || getFallbackSnippet();
    const metricName = selectedMetricConfig?.name || 'All Metrics';

    const wrappers = {
      javascript: `// VIZME Analytics - ${metricName}
// Paste this in your main JavaScript file

${snippet}

// Optional: Track custom events
// window.trackMetric('metric_name', value, { label: 'value' });`,

      html: `<!-- VIZME Analytics - ${metricName} -->
<!-- Paste this before the closing </body> tag -->

<script>
${snippet}
</script>

<!-- Optional: Track custom events -->
<!-- <button data-track="button_clicks" data-value="1">Click me</button> -->`,

      react: `// VIZME Analytics - ${metricName}
// Add this to your main App.jsx or index.jsx

import { useEffect } from 'react';

function useVizmeAnalytics() {
  useEffect(() => {
    ${snippet}
  }, []);
}

// Usage in your App component:
// function App() {
//   useVizmeAnalytics();
//   return <YourApp />;
// }

export default useVizmeAnalytics;`,

      vue: `// VIZME Analytics - ${metricName}
// Add this as a Vue plugin or in your main.js

export default {
  install(app) {
    ${snippet}
    
    // Make tracking available globally
    app.config.globalProperties.$trackMetric = window.trackMetric;
  }
}

// Usage in main.js:
// import VizmePlugin from './vizme-plugin'
// app.use(VizmePlugin)`,

      angular: `// VIZME Analytics - ${metricName}
// Add this as an Angular service

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class VizmeService {
  constructor() {
    ${snippet}
  }

  trackMetric(name: string, value: number, labels?: Record<string, string>) {
    if (window['trackMetric']) {
      window['trackMetric'](name, value, labels);
    }
  }
}`,
    };

    return wrappers[selectedFramework] || wrappers.javascript;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getFrameworkCode());
      setCopied(true);
      showToast('Code copied to clipboard!', 'success', 2000);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showToast('Failed to copy code', 'error');
    }
  };

  const checkConnection = async () => {
    setChecking(true);
    // Simulate connection check
    setTimeout(() => {
      setChecking(false);
      showToast('No events detected yet. Deploy the snippet first.', 'info', 3000);
    }, 1500);
  };

  const handleCompleteSetup = () => {
    showToast('Setup completed successfully!', 'success');
    navigate('/');
  };

  const handleBack = () => {
    navigate('/api-keys');
  };

  const renderSyntaxHighlightedCode = () => {
    const code = getFrameworkCode();

    // Simple syntax highlighting
    const highlighted = code
      .replace(
        /(import|from|export|const|function|return|class|default|if|else)/g,
        '<span class="code-keyword">$1</span>'
      )
      .replace(/('.*?'|".*?")/g, '<span class="code-string">$1</span>')
      .replace(/(\/\/.*$)/gm, '<span class="code-comment">$1</span>')
      .replace(/(<!--[\s\S]*?-->)/g, '<span class="code-comment">$1</span>')
      .replace(/\b(true|false|null|undefined)\b/g, '<span class="code-keyword">$1</span>')
      .replace(/@(\w+)/g, '<span class="code-keyword">@$1</span>');

    return highlighted;
  };

  const getFilename = () => {
    const names = {
      javascript: 'vizme-setup.js',
      html: 'index.html',
      react: 'useVizmeAnalytics.js',
      vue: 'vizme-plugin.js',
      angular: 'vizme.service.ts',
    };
    return names[selectedFramework] || 'vizme-setup.js';
  };

  if (loading) {
    return <CodeGenerationSkeleton />;
  }

  return (
    <div className="code-generation-page">
      {/* Header Section */}
      <div className="cg-header">
        <h1 className="cg-title">Install VIZME Analytics</h1>
        <p className="cg-subtitle">
          Tailor the SDK integration for your tech stack. Copy the snippet below into your
          application's entry point to start collecting insights.
        </p>
      </div>

      {/* Progress Stepper */}
      <ProgressStepper currentStep={3} />

      {/* Current Configuration Info */}
      {selectedMetricConfig && (
        <div className="cg-config-info">
          <span className="cg-config-badge">
            <CheckIcon size={14} />
            Configured for: <strong>{selectedMetricConfig.name}</strong>
            {selectedMetricConfig.metric_name && (
              <span className="cg-metric-name">({selectedMetricConfig.metric_name})</span>
            )}
          </span>
          {metricConfigs.length > 1 && (
            <select
              className="cg-config-select"
              value={selectedMetricConfig?.id || ''}
              onChange={(e) => {
                const config = metricConfigs.find((c) => c.id === parseInt(e.target.value));
                setSelectedMetricConfig(config || null);
              }}
            >
              <option value="">All Configurations</option>
              {metricConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {error && <div className="cg-error">{error}</div>}

      {/* Main Content Grid */}
      <div className="cg-content-grid">
        {/* Left Column */}
        <div className="cg-left-column">
          {/* Framework Tabs */}
          <div className="cg-framework-tabs">
            {FRAMEWORKS.map((framework) => (
              <button
                key={framework.id}
                className={`cg-framework-tab ${selectedFramework === framework.id ? 'active' : ''}`}
                onClick={() => setSelectedFramework(framework.id)}
              >
                <span className="cg-framework-icon">{framework.icon}</span>
                {framework.label}
              </button>
            ))}
          </div>

          {/* Code Snippet Box */}
          <div className="cg-code-box">
            <div className="cg-code-header">
              <div className="cg-window-controls">
                <span className="cg-control red"></span>
                <span className="cg-control yellow"></span>
                <span className="cg-control green"></span>
              </div>
              <span className="cg-filename">{getFilename()}</span>
              <button className="cg-copy-btn" onClick={copyToClipboard} disabled={generating}>
                <CopyIcon size={14} />
                <span>{copied ? 'Copied!' : 'Copy Snippet'}</span>
              </button>
            </div>
            <div className="cg-code-content">
              {generating ? (
                <div className="cg-code-loading">
                  <div className="cg-spinner small"></div>
                  <span>Generating code...</span>
                </div>
              ) : (
                <pre>
                  <code dangerouslySetInnerHTML={{ __html: renderSyntaxHighlightedCode() }} />
                </pre>
              )}
            </div>
          </div>

          {/* Tracking Configuration */}
          <div className="cg-tracking-config">
            <h3 className="cg-config-title">
              <span className="cg-config-icon">☰</span>
              Tracking Configuration
            </h3>
            <div className="cg-config-options">
              <label className="cg-config-option">
                <input
                  type="checkbox"
                  checked={autoPageViews}
                  onChange={(e) => setAutoPageViews(e.target.checked)}
                  className="cg-checkbox"
                />
                <div className="cg-checkbox-custom">{autoPageViews && <CheckIcon size={14} />}</div>
                <div className="cg-option-text">
                  <span className="cg-option-label">Auto Page Views</span>
                  <span className="cg-option-desc">
                    Automatically track navigation changes in SPAs.
                  </span>
                </div>
              </label>
              <label className="cg-config-option">
                <input
                  type="checkbox"
                  checked={scrollDepth}
                  onChange={(e) => setScrollDepth(e.target.checked)}
                  className="cg-checkbox"
                />
                <div className="cg-checkbox-custom">{scrollDepth && <CheckIcon size={14} />}</div>
                <div className="cg-option-text">
                  <span className="cg-option-label">Scroll Depth</span>
                  <span className="cg-option-desc">
                    Track how far users scroll on your documentation.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="cg-right-column">
          {/* Connection Status Card */}
          <div className="cg-status-card">
            <div className="cg-status-header">
              <span className="cg-status-title">CONNECTION STATUS</span>
              <span className="cg-status-indicator"></span>
            </div>
            <div className="cg-status-content">
              <div className="cg-status-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path
                    d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4zm0 36c-8.837 0-16-7.163-16-16S15.163 8 24 8s16 7.163 16 16-7.163 16-16 16z"
                    fill="currentColor"
                    opacity="0.2"
                  />
                  <path
                    d="M24 14v4M24 30v4M14 24h4M30 24h4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M18 18l2.5 2.5M27.5 27.5l2.5 2.5M18 30l2.5-2.5M27.5 20.5l2.5-2.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="cg-status-main">Status: Not detected</p>
              <p className="cg-status-sub">Waiting for first event from your app...</p>
            </div>
            <div className="cg-status-actions">
              <button className="cg-check-btn" onClick={checkConnection} disabled={checking}>
                <RefreshIcon size={18} className={checking ? 'spinning' : ''} />
                {checking ? 'Checking...' : 'Check for Connection'}
              </button>
              <p className="cg-status-tip">
                Tip: Ensure you've deployed the snippet to your development environment.
              </p>
            </div>
          </div>

          {/* Need Help Card */}
          <div className="cg-help-card">
            <div className="cg-help-icon">ℹ</div>
            <div className="cg-help-content">
              <p className="cg-help-title">Need Help?</p>
              <p className="cg-help-text">
                Check our{' '}
                <a href="#" className="cg-help-link">
                  Integration Docs
                </a>{' '}
                or contact our technical support team for a guided walkthrough.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="cg-footer-actions">
        <button className="cg-back-btn" onClick={handleBack}>
          <ArrowBackIcon size={18} />
          Back to Workspace
        </button>
        <button className="cg-complete-btn" onClick={handleCompleteSetup}>
          Complete Setup
          <RocketIcon size={20} />
        </button>
      </div>

      {/* Trust Badges */}
      <div className="cg-trust-section">
        <p className="cg-trust-text">TRUSTED BY THE WORLD'S MOST INNOVATIVE ENGINEERING TEAMS</p>
        <div className="cg-trust-logos">
          <div className="cg-trust-logo"></div>
          <div className="cg-trust-logo"></div>
          <div className="cg-trust-logo"></div>
          <div className="cg-trust-logo"></div>
        </div>
      </div>
    </div>
  );
}

export default CodeGeneration;
