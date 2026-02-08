import { useState, useEffect } from 'react';
import { apiKeysAPI } from '@/api/apiKeys';
import { useToast } from '@/components/ToastContainer';
import './ApiKeys.css';

function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [error, setError] = useState('');
  const { showToast } = useToast();

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

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await apiKeysAPI.create(keyName);
      setNewKey(response.data);
      setKeyName('');
      setShowForm(false);
      showToast('API key created successfully!', 'success');
      await fetchKeys();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to create API key';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    }
  };

  const handleToggleActive = async (id, isActive) => {
    try {
      await apiKeysAPI.update(id, { is_active: !isActive });
      showToast(`API key ${!isActive ? 'activated' : 'deactivated'} successfully!`, 'success');
      await fetchKeys();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to update API key';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this API key?')) {
      return;
    }

    try {
      await apiKeysAPI.delete(id);
      showToast('API key deleted successfully!', 'success');
      await fetchKeys();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to delete API key';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success', 2000);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="api-keys">
      <div className="page-header">
        <h1>API Keys</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          {showForm ? 'Cancel' : '+ New API Key'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {newKey && (
        <div className="card new-key-alert">
          <h3>API Key Created!</h3>
          <p>Store this key securely - it will not be shown again.</p>
          <div className="key-display">
            <code>{newKey.api_key}</code>
            <button onClick={() => copyToClipboard(newKey.api_key)} className="btn btn-secondary">
              Copy
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="btn btn-primary">
            Got it
          </button>
        </div>
      )}

      {showForm && (
        <div className="card">
          <h2>Create New API Key</h2>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Key Name *</label>
              <input
                type="text"
                className="form-input"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                required
                placeholder="e.g., Production Key"
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                Create
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="keys-list">
        {keys.length === 0 ? (
          <div className="card">
            <p>No API keys yet. Create one to get started!</p>
          </div>
        ) : (
          keys.map(key => (
            <div key={key.id} className="card key-card">
              <div className="key-header">
                <div>
                  <h3>{key.key_name}</h3>
                  <p className="key-meta">
                    Created: {new Date(key.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="key-status">
                  <span className={`status-badge ${key.is_active ? 'active' : 'inactive'}`}>
                    {key.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="key-value">
                <code>{key.api_key.substring(0, 20)}...</code>
              </div>
              <div className="key-actions">
                <button
                  onClick={() => handleToggleActive(key.id, key.is_active)}
                  className="btn btn-secondary"
                >
                  {key.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handleDelete(key.id)}
                  className="btn btn-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ApiKeys;
