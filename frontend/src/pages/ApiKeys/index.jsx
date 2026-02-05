import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiKeysAPI } from '@/api/apiKeys';
import { useToast } from '@/components/ToastContainer';
import { useConfirm } from '@/components/ConfirmModal';
import ProgressStepper from '@/components/ProgressStepper';
import {
  AddCircleIcon,
  CopyIcon,
  RefreshIcon,
  KeyIcon,
  LockIcon,
  ShieldIcon,
  WarningIcon,
  DocumentIcon,
  ArrowBackIcon,
  SecurityIcon,
  HubIcon,
  EyeOffIcon,
} from '@/assets/icons';
import ApiKeysSkeleton from './ApiKeysSkeleton';
import './ApiKeys.css';

function ApiKeys() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState('Main Analytics Feed');
  const [environment, setEnvironment] = useState('production');
  const [permissions, setPermissions] = useState({
    readMetrics: true,
    writeData: true,
    adminAccess: false,
    webhooks: true,
  });
  const [newKey, setNewKey] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const response = await apiKeysAPI.getAll();
      setKeys(response.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!keyName.trim()) {
      showToast('Please enter a key name', 'error');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const response = await apiKeysAPI.create(keyName);
      setNewKey(response.data);
      showToast('API key generated successfully!', 'success');
      await fetchKeys();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to generate API key';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id) => {
    const confirmed = await confirm({
      title: 'Revoke API Key',
      message:
        'Are you sure you want to revoke this API key? This action cannot be undone and any applications using this key will immediately lose access.',
      variant: 'danger',
      confirmText: 'Revoke Key',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      return;
    }

    try {
      await apiKeysAPI.delete(id);
      showToast('API key revoked successfully!', 'success');
      await fetchKeys();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to revoke API key';
      showToast(errorMsg, 'error');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success', 2000);
  };

  const handlePermissionChange = (permission) => {
    setPermissions((prev) => ({
      ...prev,
      [permission]: !prev[permission],
    }));
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Created today';
    if (diffDays === 1) return 'Created 1 day ago';
    return `Created ${diffDays} days ago`;
  };

  const maskKey = (key) => {
    if (!key) return '';
    const prefix = key.substring(0, 8);
    return `${prefix}••••_••••_••••`;
  };

  const getEnvironmentFromKey = (key) => {
    if (key.api_key?.includes('live')) return 'production';
    if (key.api_key?.includes('test')) return 'staging';
    return 'development';
  };

  if (loading) {
    return <ApiKeysSkeleton />;
  }

  return (
    <div className="apikeys-page">
      <ProgressStepper currentStep={2} />

      {/* Main Card */}
      <div className="apikeys-card">
        {/* Header */}
        <div className="apikeys-header">
          <div className="apikeys-header-content">
            <h1 className="apikeys-title">Step 2: Generate API Key</h1>
            <p className="apikeys-subtitle">Establish a secure connection to your data sources.</p>
          </div>
          <button className="btn-docs">
            <DocumentIcon size={18} />
            <span>View Docs</span>
          </button>
        </div>

        {/* Content */}
        <div className="apikeys-content">
          <div className="apikeys-grid">
            {/* Left Column - Key Configuration */}
            <div className="key-configuration">
              <h3 className="section-title">Key Configuration</h3>

              <div className="form-fields">
                <label className="form-field">
                  <span className="field-label">Key Name</span>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="e.g., Production Analytics Key"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span className="field-label">Environment</span>
                  <select
                    className="field-select"
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </label>
              </div>

              <div className="permissions-section">
                <span className="field-label">Permissions Matrix</span>
                <div className="permissions-grid">
                  <label className="permission-item">
                    <input
                      type="checkbox"
                      checked={permissions.readMetrics}
                      onChange={() => handlePermissionChange('readMetrics')}
                    />
                    <span className="permission-label">Read Metrics</span>
                  </label>
                  <label className="permission-item">
                    <input
                      type="checkbox"
                      checked={permissions.writeData}
                      onChange={() => handlePermissionChange('writeData')}
                    />
                    <span className="permission-label">Write Data</span>
                  </label>
                  <label className="permission-item">
                    <input
                      type="checkbox"
                      checked={permissions.adminAccess}
                      onChange={() => handlePermissionChange('adminAccess')}
                    />
                    <span className="permission-label">Admin Access</span>
                  </label>
                  <label className="permission-item">
                    <input
                      type="checkbox"
                      checked={permissions.webhooks}
                      onChange={() => handlePermissionChange('webhooks')}
                    />
                    <span className="permission-label">Webhooks</span>
                  </label>
                </div>
              </div>

              <button className="btn-generate" onClick={handleGenerateKey} disabled={generating}>
                <AddCircleIcon size={20} />
                {generating ? 'Generating...' : 'Generate New Key'}
              </button>
            </div>

            {/* Right Column - Secret Key Display */}
            <div className="secret-key-panel">
              <div className="secret-key-header">
                <span className="secret-key-label">Your Secret Key</span>
                {newKey && (
                  <span className="live-badge">
                    <span className="live-dot"></span>
                    Live
                  </span>
                )}
              </div>

              <div className="secret-key-display">
                <div className="key-value">
                  {newKey ? newKey.api_key : 'vz_live_••••_••••_••••_••••'}
                </div>
                <div className="key-actions-inline">
                  <button
                    className="key-action-btn"
                    onClick={() => newKey && copyToClipboard(newKey.api_key)}
                    title="Copy to clipboard"
                    disabled={!newKey}
                  >
                    <CopyIcon size={20} />
                  </button>
                  <button
                    className="key-action-btn"
                    onClick={handleGenerateKey}
                    title="Regenerate"
                    disabled={generating}
                  >
                    <RefreshIcon size={20} />
                  </button>
                </div>
              </div>

              {newKey && (
                <div className="security-warning">
                  <WarningIcon size={20} />
                  <div className="warning-content">
                    <p className="warning-title">Security Warning</p>
                    <p className="warning-text">
                      For your security, we only show this key once. Please store it in a secure
                      password manager immediately.
                    </p>
                  </div>
                </div>
              )}

              <div className="security-icons">
                <KeyIcon size={32} />
                <div className="icon-divider"></div>
                <LockIcon size={32} />
                <div className="icon-divider"></div>
                <ShieldIcon size={32} />
              </div>
            </div>
          </div>

          {/* Existing Keys Table */}
          <div className="existing-keys-section">
            <div className="existing-keys-header">
              <h3 className="section-title">Existing Project Keys</h3>
              <span className="keys-count">Total: {keys.length} Active Keys</span>
            </div>

            <div className="keys-table-container">
              <table className="keys-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Environment</th>
                    <th>Key (Masked)</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-state">
                        <p>No API keys yet. Generate one to get started!</p>
                      </td>
                    </tr>
                  ) : (
                    keys.map((key) => {
                      const env = getEnvironmentFromKey(key);
                      return (
                        <tr key={key.id}>
                          <td>
                            <div className="key-name-cell">
                              <span className="key-name">{key.key_name}</span>
                              <span className="key-created">{formatDate(key.created_at)}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`env-badge env-${env}`}>
                              {env === 'production'
                                ? 'Production'
                                : env === 'staging'
                                  ? 'Staging'
                                  : 'Development'}
                            </span>
                          </td>
                          <td className="key-masked">{maskKey(key.api_key)}</td>
                          <td className="text-right">
                            <button className="btn-revoke" onClick={() => handleRevoke(key.id)}>
                              Revoke
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="apikeys-footer">
          <button className="btn-back" onClick={() => navigate('/metric-configs')}>
            <ArrowBackIcon size={18} />
            Back to Metrics
          </button>
          <div className="footer-actions">
            <button className="btn-skip" onClick={() => navigate('/code-generation')}>
              Skip for now
            </button>
            <button className="btn-continue" onClick={() => navigate('/code-generation')}>
              Continue to Activation
            </button>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="feature-cards">
        <div className="feature-card">
          <SecurityIcon size={24} className="feature-icon" />
          <h4 className="feature-title">Encrypted Storage</h4>
          <p className="feature-description">
            All keys are hashed using industry-standard salt protocols before storage in our secure
            vault.
          </p>
        </div>
        <div className="feature-card">
          <HubIcon size={24} className="feature-icon" />
          <h4 className="feature-title">Multi-Environment</h4>
          <p className="feature-description">
            Generate isolated keys for prod, staging, and local development flows to ensure data
            integrity.
          </p>
        </div>
        <div className="feature-card">
          <EyeOffIcon size={24} className="feature-icon" />
          <h4 className="feature-title">Least Privilege</h4>
          <p className="feature-description">
            Use the permissions matrix to restrict keys to only necessary actions, minimizing
            security risk.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="page-footer">
        &copy; 2024 VIZME Inc. &bull; Enterprise Grade &bull; Built for Engineering Teams
      </footer>
    </div>
  );
}

export default ApiKeys;
