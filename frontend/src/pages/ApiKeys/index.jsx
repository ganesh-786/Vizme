import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiKeysAPI } from '@/api/apiKeys';
import { useToast } from '@/components/ToastContainer';
import { useConfirm } from '@/components/ConfirmModal';
import ProgressStepper from '@/components/ProgressStepper';
import {
  AddCircleIcon,
  CopyIcon,
  CheckIcon,
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

  // ---- State ---------------------------------------------------------------
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState('Account API Key');
  const [environment, setEnvironment] = useState('production');
  const [permissions, setPermissions] = useState({
    readMetrics: true,
    writeData: true,
    adminAccess: false,
    webhooks: true,
  });
  const [activeKey, setActiveKey] = useState(null); // key displayed in the hero panel (masked)
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copiedKeyId, setCopiedKeyId] = useState(null); // flash "Copied!" per-row

  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // ---- Bootstrap -----------------------------------------------------------
  useEffect(() => {
    fetchInitialData();
  }, []);

  /**
   * Fetch existing keys, then auto-ensure a user-level key.
   * Industry standard: ONE key per user — covers all metrics (current & future).
   */
  const fetchInitialData = async () => {
    try {
      const keysRes = await apiKeysAPI.getAll();
      const fetchedKeys = keysRes.data || [];
      setKeys(fetchedKeys);

      // Auto-ensure the user-level API key (no metric_config_id)
      await autoEnsureKey();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  /** Refresh the keys list (used after mutations). */
  const fetchKeys = async () => {
    try {
      const response = await apiKeysAPI.getAll();
      setKeys(response.data || []);
    } catch {
      /* silent — non-critical refresh */
    }
  };

  // ---- Auto-ensure (user-level key) ----------------------------------------
  /**
   * Idempotent: creates a new user-level key or returns the existing one.
   * When newly created the raw key is auto-copied to the clipboard — it is
   * never stored in React state or rendered in the DOM.
   */
  const autoEnsureKey = async () => {
    try {
      const response = await apiKeysAPI.ensure();
      const { data, is_new } = response;

      if (is_new && data.api_key) {
        // One-time clipboard copy — raw key never enters display state
        try {
          await navigator.clipboard.writeText(data.api_key);
          showToast('API key auto-generated and copied to clipboard!', 'success', 4000);
        } catch {
          showToast('API key auto-generated. Use the Copy button to copy it.', 'info', 4000);
        }
      }

      // Store only masked / safe fields
      setActiveKey({
        id: data.id,
        key_name: data.key_name,
        masked_key: data.masked_key,
        is_active: data.is_active,
        created_at: data.created_at,
        is_new,
      });

      // Refresh the keys list so the table is up-to-date
      await fetchKeys();
    } catch (err) {
      console.error('Auto-ensure failed:', err);
    }
  };

  // ---- Manual key creation -------------------------------------------------
  const handleGenerateKey = async () => {
    if (!keyName.trim()) {
      showToast('Please enter a key name', 'error');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const response = await apiKeysAPI.create(keyName);
      const data = response.data;

      // Auto-copy raw key to clipboard (never display it)
      if (data.api_key) {
        try {
          await navigator.clipboard.writeText(data.api_key);
          showToast('API key generated and copied to clipboard!', 'success', 4000);
        } catch {
          showToast('API key generated. Use the Copy button to copy it.', 'info', 4000);
        }
      }

      // Display only masked info in the hero panel
      setActiveKey({
        id: data.id,
        key_name: data.key_name,
        masked_key: data.masked_key || 'mk_••••••••••••',
        is_active: data.is_active,
        created_at: data.created_at,
        is_new: true,
      });

      await fetchKeys();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to generate API key';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setGenerating(false);
    }
  };

  // ---- Re-copy (secure) ----------------------------------------------------
  /** Fetch the raw key via a dedicated endpoint and write it to the clipboard. */
  const handleCopyKey = async (id) => {
    try {
      const response = await apiKeysAPI.copy(id);
      await navigator.clipboard.writeText(response.data.api_key);
      setCopiedKeyId(id);
      showToast('Copied to clipboard!', 'success', 2000);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (err) {
      showToast('Failed to copy key', 'error');
    }
  };

  // ---- Revoke --------------------------------------------------------------
  const handleRevoke = async (id) => {
    const confirmed = await confirm({
      title: 'Revoke API Key',
      message:
        'Are you sure you want to revoke this API key? This action cannot be undone and any applications using this key will immediately lose access.',
      variant: 'danger',
      confirmText: 'Revoke Key',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    try {
      await apiKeysAPI.delete(id);
      showToast('API key revoked successfully!', 'success');

      // Clear the hero panel if the revoked key was active
      if (activeKey?.id === id) setActiveKey(null);
      await fetchKeys();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to revoke API key';
      showToast(errorMsg, 'error');
    }
  };

  // ---- Helpers -------------------------------------------------------------
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

  const getEnvironmentFromKey = (key) => {
    if (key.key_name?.toLowerCase().includes('prod')) return 'production';
    if (key.key_name?.toLowerCase().includes('stag')) return 'staging';
    return 'development';
  };

  // ---- Render --------------------------------------------------------------
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
            <p className="apikeys-subtitle">
              One key for your entire account — it covers all current and future metrics automatically.
            </p>
          </div>
          <button className="btn-docs">
            <DocumentIcon size={18} />
            <span>View Docs</span>
          </button>
        </div>

        {/* Content */}
        <div className="apikeys-content">
          <div className="apikeys-grid">
            {/* Left Column — Key Configuration */}
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

            {/* Right Column — Secret Key Display (always masked) */}
            <div className="secret-key-panel">
              <div className="secret-key-header">
                <span className="secret-key-label">Your Account Key</span>
                {activeKey && (
                  <span className="live-badge">
                    <span className="live-dot"></span>
                    {activeKey.is_new ? 'New' : 'Live'}
                  </span>
                )}
              </div>

              <div className="secret-key-display">
                <div className="key-value">
                  {activeKey ? activeKey.masked_key : 'mk_••••••••••••'}
                </div>
                <div className="key-actions-inline">
                  <button
                    className="key-action-btn"
                    onClick={() => activeKey && handleCopyKey(activeKey.id)}
                    title="Copy to clipboard"
                    disabled={!activeKey}
                  >
                    {copiedKeyId === activeKey?.id ? (
                      <CheckIcon size={20} />
                    ) : (
                      <CopyIcon size={20} />
                    )}
                  </button>
                </div>
              </div>

              {activeKey?.is_new && (
                <div className="security-warning">
                  <WarningIcon size={20} />
                  <div className="warning-content">
                    <p className="warning-title">Copied to Clipboard</p>
                    <p className="warning-text">
                      For your security, the key is never displayed. It has been copied to your
                      clipboard — store it in a secure password manager now. You can re-copy
                      anytime using the copy button. This single key works for all your metrics.
                    </p>
                  </div>
                </div>
              )}

              {activeKey && !activeKey.is_new && (
                <div className="security-warning">
                  <LockIcon size={20} />
                  <div className="warning-content">
                    <p className="warning-title">Key Secured</p>
                    <p className="warning-text">
                      This key is never shown for security. Use the copy button above to copy it
                      to your clipboard whenever you need it. It covers all metrics automatically.
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
              <h3 className="section-title">Existing Keys</h3>
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
                          <td className="key-masked">{key.masked_key}</td>
                          <td className="text-right">
                            <div className="key-row-actions">
                              <button
                                className="btn-copy-inline"
                                onClick={() => handleCopyKey(key.id)}
                                title="Copy to clipboard"
                              >
                                {copiedKeyId === key.id ? (
                                  <>
                                    <CheckIcon size={14} />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <CopyIcon size={14} />
                                    Copy
                                  </>
                                )}
                              </button>
                              <button className="btn-revoke" onClick={() => handleRevoke(key.id)}>
                                Revoke
                              </button>
                            </div>
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
          <h4 className="feature-title">Universal Coverage</h4>
          <p className="feature-description">
            A single API key covers all your metric configurations — current and future. No
            reconfiguration needed.
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
