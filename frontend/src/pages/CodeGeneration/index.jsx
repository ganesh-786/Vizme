import { useState, useEffect } from 'react';
import { codeGenerationAPI } from '../../api/codeGeneration';
import { apiKeysAPI } from '../../api/apiKeys';
import { metricConfigsAPI } from '../../api/metricConfigs';
import { useToast } from '../../components/ToastContainer';
import './CodeGeneration.css';

function CodeGeneration() {
  const [apiKeys, setApiKeys] = useState([]);
  const [metricConfigs, setMetricConfigs] = useState([]);
  const [selectedApiKey, setSelectedApiKey] = useState('');
  const [selectedMetricConfig, setSelectedMetricConfig] = useState('');
  const [autoTrack, setAutoTrack] = useState(true);
  const [customEvents, setCustomEvents] = useState(true);
  const [generatedCode, setGeneratedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [keysRes, configsRes] = await Promise.all([
        apiKeysAPI.getAll(),
        metricConfigsAPI.getAll()
      ]);
      setApiKeys(keysRes.data || []);
      setMetricConfigs(configsRes.data || []);
    } catch (err) {
      setError('Failed to fetch data');
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!selectedApiKey) {
      setError('Please select an API key');
      setLoading(false);
      return;
    }

    try {
      const response = await codeGenerationAPI.generate(
        parseInt(selectedApiKey),
        selectedMetricConfig ? parseInt(selectedMetricConfig) : null,
        { autoTrack, customEvents }
      );
      setGeneratedCode(response.data.code);
      showToast('Code generated successfully!', 'success');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to generate code';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    showToast('Code copied to clipboard!', 'success', 2000);
  };

  return (
    <div className="code-generation">
      <h1>Code Generation</h1>
      <p className="page-subtitle">
        Generate tracking code to embed in your website. The code will automatically send metrics to your endpoint.
      </p>

      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <h2>Configuration</h2>
        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label className="form-label">API Key *</label>
            <select
              className="form-select"
              value={selectedApiKey}
              onChange={(e) => setSelectedApiKey(e.target.value)}
              required
            >
              <option value="">Select an API key</option>
              {apiKeys.filter(k => k.is_active).map(key => (
                <option key={key.id} value={key.id}>{key.key_name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Metric Configuration (Optional)</label>
            <select
              className="form-select"
              value={selectedMetricConfig}
              onChange={(e) => setSelectedMetricConfig(e.target.value)}
            >
              <option value="">All configurations</option>
              {metricConfigs.map(config => (
                <option key={config.id} value={config.id}>{config.name}</option>
              ))}
            </select>
            <small className="form-hint">Leave empty to include all metric configurations</small>
          </div>

          <div className="form-group">
            <label className="form-label">
              <input
                type="checkbox"
                checked={autoTrack}
                onChange={(e) => setAutoTrack(e.target.checked)}
                style={{ marginRight: '0.5rem' }}
              />
              Enable Auto-tracking (page views, time on page)
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">
              <input
                type="checkbox"
                checked={customEvents}
                onChange={(e) => setCustomEvents(e.target.checked)}
                style={{ marginRight: '0.5rem' }}
              />
              Enable Custom Events Tracking
            </label>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Generating...' : 'Generate Code'}
          </button>
        </form>
      </div>

      {generatedCode && (
        <div className="card">
          <div className="code-header">
            <h2>Generated Code</h2>
            <button onClick={copyToClipboard} className="btn btn-secondary">
              Copy Code
            </button>
          </div>
          <div className="code-container">
            <pre><code>{generatedCode}</code></pre>
          </div>
          <div className="code-instructions">
            <h3>How to use:</h3>
            <ol>
              <li>Copy the code above</li>
              <li>Paste it before the closing <code>&lt;/body&gt;</code> tag in your HTML</li>
              <li>The code will automatically start tracking metrics</li>
              <li>For custom events, use: <code>window.trackMetric('metric_name', value, labels)</code></li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeGeneration;
