import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { metricConfigsAPI } from '../api/metricConfigs';
import { useToast } from '../components/ToastContainer';
import './MetricConfigs.css';

const METRIC_TYPES = ['counter', 'gauge', 'histogram', 'summary'];

function MetricConfigs() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    metric_type: 'counter',
    metric_name: '',
    help_text: '',
    labels: []
  });
  const [error, setError] = useState('');
  const token = useAuthStore((state) => state.token);
  const authReady = useAuthStore((state) => state.authReady);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Block until auth is ready AND token exists
    if (!authReady || !token || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchConfigs();
  }, [authReady, token]);

  const fetchConfigs = async () => {
    try {
      const response = await metricConfigsAPI.getAll();
      setConfigs(response.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch metric configs');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (editingId) {
        await metricConfigsAPI.update(editingId, formData);
        showToast('Metric configuration updated successfully!', 'success');
      } else {
        await metricConfigsAPI.create(formData);
        showToast('Metric configuration created successfully!', 'success');
      }
      await fetchConfigs();
      resetForm();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to save metric config';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    }
  };

  const handleEdit = (config) => {
    setFormData({
      name: config.name,
      description: config.description || '',
      metric_type: config.metric_type,
      metric_name: config.metric_name,
      help_text: config.help_text || '',
      labels: config.labels || []
    });
    setEditingId(config.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this metric config?')) {
      return;
    }

    try {
      await metricConfigsAPI.delete(id);
      showToast('Metric configuration deleted successfully!', 'success');
      await fetchConfigs();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to delete metric config';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      metric_type: 'counter',
      metric_name: '',
      help_text: '',
      labels: []
    });
    setEditingId(null);
    setShowForm(false);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="metric-configs">
      <div className="page-header">
        <h1>Metric Configurations</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          {showForm ? 'Cancel' : '+ New Configuration'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="card">
          <h2>{editingId ? 'Edit' : 'Create'} Metric Configuration</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Metric Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.metric_name}
                onChange={(e) => setFormData({ ...formData, metric_name: e.target.value })}
                required
                pattern="^[a-zA-Z_:][a-zA-Z0-9_:]*$"
              />
              <small className="form-hint">Alphanumeric, underscore, colon (e.g., user_clicks_total)</small>
            </div>

            <div className="form-group">
              <label className="form-label">Metric Type *</label>
              <select
                className="form-select"
                value={formData.metric_type}
                onChange={(e) => setFormData({ ...formData, metric_type: e.target.value })}
                required
              >
                {METRIC_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Help Text</label>
              <textarea
                className="form-textarea"
                value={formData.help_text}
                onChange={(e) => setFormData({ ...formData, help_text: e.target.value })}
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={resetForm} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="configs-list">
        {configs.length === 0 ? (
          <div className="card">
            <p>No metric configurations yet. Create one to get started!</p>
          </div>
        ) : (
          configs.map(config => (
            <div key={config.id} className="card config-card">
              <div className="config-header">
                <h3>{config.name}</h3>
                <div className="config-actions">
                  <button onClick={() => handleEdit(config)} className="btn btn-secondary">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(config.id)} className="btn btn-danger">
                    Delete
                  </button>
                </div>
              </div>
              <div className="config-details">
                <p><strong>Metric Name:</strong> {config.metric_name}</p>
                <p><strong>Type:</strong> <span className="badge">{config.metric_type}</span></p>
                {config.description && <p><strong>Description:</strong> {config.description}</p>}
                {config.help_text && <p><strong>Help:</strong> {config.help_text}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default MetricConfigs;

