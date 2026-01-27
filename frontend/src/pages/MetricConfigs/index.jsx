import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { metricConfigsAPI } from '../../api/metricConfigs';
import { useToast } from '../../components/ToastContainer';
import ProgressStepper from '../../components/ProgressStepper';
import {
  SettingsIcon,
  AddCircleIcon,
  DeleteIcon,
  ExpandMoreIcon,
  ArrowRightIcon,
  UnfoldMoreIcon,
} from '../../assets/icons';
import './MetricConfigs.css';

const METRIC_TYPES = ['Counter', 'Gauge', 'Summary', 'Histogram'];

function MetricConfigs() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [anonymizeIP, setAnonymizeIP] = useState(true);
  const [realTimeWebhook, setRealTimeWebhook] = useState(false);
  const [labels, setLabels] = useState([{ key: 'env', value: 'prod' }]);
  const [formData, setFormData] = useState({
    name: 'Main Production Feed',
    metric_type: 'Counter',
    description: '',
    help_text: '',
  });

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddLabel = () => {
    setLabels([...labels, { key: '', value: '' }]);
  };

  const handleRemoveLabel = (index) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  const handleLabelChange = (index, field, value) => {
    const updated = [...labels];
    updated[index][field] = value;
    setLabels(updated);
  };

  // Generate metric_name from configuration name
  const generateMetricName = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '') || 'metric';
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        metric_name: generateMetricName(formData.name),
        metric_type: formData.metric_type.toLowerCase(),
        description: formData.description,
        help_text: formData.help_text,
        labels: labels
          .filter((l) => l.key && l.value)
          .map((l) => ({ name: l.key, value: l.value })),
      };
      await metricConfigsAPI.create(payload);
      showToast('Draft saved successfully!', 'success');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to save draft';
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        metric_name: generateMetricName(formData.name),
        metric_type: formData.metric_type.toLowerCase(),
        description: formData.description,
        help_text: formData.help_text,
        labels: labels
          .filter((l) => l.key && l.value)
          .map((l) => ({ name: l.key, value: l.value })),
      };
      await metricConfigsAPI.create(payload);
      showToast('Metric configuration created successfully!', 'success');
      navigate('/api-keys');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to create metric config';
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="metric-configs-page">
      <div className="metric-configs-container">
        <ProgressStepper currentStep={1} />

        <div className="metric-configs-header">
          <h1 className="metric-configs-title">Configure Your Metrics</h1>
          <p className="metric-configs-subtitle">
            Define the identity and context for your data stream.
          </p>
        </div>

        <div className="metric-configs-card">
          <form onSubmit={handleSubmit} className="metric-configs-form">
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Configuration Name</label>
                <p className="form-helper">Unique identifier for this tracking instance.</p>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g. Production Analytics V2"
                />
              </div>

              <div className="form-field">
                <label className="form-label">Metric Type</label>
                <p className="form-helper">Select the primary data structure.</p>
                <div className="select-wrapper">
                  <select
                    className="form-select"
                    value={formData.metric_type}
                    onChange={(e) => handleInputChange('metric_type', e.target.value)}
                  >
                    {METRIC_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <UnfoldMoreIcon size={20} className="select-icon" />
                </div>
              </div>
            </div>

            <div className="form-field form-field-full">
              <label className="form-label">Description</label>
              <p className="form-helper">
                Provide detailed context about what this metric tracks and why.
              </p>
              <textarea
                className="form-textarea"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe the purpose of this metric..."
                rows={4}
              />
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Help Text</label>
                <p className="form-helper">Define what users see in UI tooltips.</p>
                <input
                  type="text"
                  className="form-input"
                  value={formData.help_text}
                  onChange={(e) => handleInputChange('help_text', e.target.value)}
                  placeholder="Tooltip content..."
                />
              </div>

              <div className="form-field">
                <label className="form-label">Labels</label>
                <p className="form-helper">Apply key-value pairs for filtering.</p>
                <div className="labels-container">
                  {labels.map((label, index) => (
                    <div key={index} className="label-row">
                      <input
                        type="text"
                        className="label-input"
                        placeholder="Key (e.g. env)"
                        value={label.key}
                        onChange={(e) => handleLabelChange(index, 'key', e.target.value)}
                      />
                      <input
                        type="text"
                        className="label-input"
                        placeholder="Value (e.g. prod)"
                        value={label.value}
                        onChange={(e) => handleLabelChange(index, 'value', e.target.value)}
                      />
                      {labels.length > 1 && (
                        <button
                          type="button"
                          className="label-delete-btn"
                          onClick={() => handleRemoveLabel(index)}
                          aria-label="Remove label"
                        >
                          <DeleteIcon size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="add-label-btn"
                    onClick={handleAddLabel}
                  >
                    <AddCircleIcon size={18} />
                    Add Label
                  </button>
                </div>
              </div>
            </div>

            <div className="advanced-section">
              <button
                type="button"
                className="advanced-summary"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                <div className="advanced-summary-content">
                  <SettingsIcon size={20} />
                  Advanced Configuration Settings
                </div>
                <ExpandMoreIcon
                  size={20}
                  className={`advanced-chevron ${advancedOpen ? 'open' : ''}`}
                />
              </button>
              {advancedOpen && (
                <div className="advanced-content">
                  <div className="advanced-item">
                    <div className="advanced-item-info">
                      <p className="advanced-item-title">Anonymize IP Addresses</p>
                      <p className="advanced-item-desc">
                        GDPR-compliant masking for all incoming requests.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch ${anonymizeIP ? 'active' : ''}`}
                      onClick={() => setAnonymizeIP(!anonymizeIP)}
                      aria-label="Toggle anonymize IP"
                    >
                      <span className="toggle-slider"></span>
                    </button>
                  </div>

                  <div className="advanced-item">
                    <div className="advanced-item-info">
                      <p className="advanced-item-title">Real-time Webhook</p>
                      <p className="advanced-item-desc">
                        Stream filtered events to your custom endpoint.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch ${realTimeWebhook ? 'active' : ''}`}
                      onClick={() => setRealTimeWebhook(!realTimeWebhook)}
                      aria-label="Toggle real-time webhook"
                    >
                      <span className="toggle-slider"></span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSaveDraft}
                disabled={loading}
              >
                Save as Draft
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                Continue to API Keys
                <ArrowRightIcon size={20} />
              </button>
            </div>
          </form>
        </div>

        <p className="help-text">
          Need help?{' '}
          <a href="#" className="help-link">
            Read the technical documentation
          </a>{' '}
          or{' '}
          <a href="#" className="help-link">
            contact engineering support
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default MetricConfigs;
