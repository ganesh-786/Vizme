import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { metricConfigsAPI } from '@/api/metricConfigs';
import { onboardingAPI } from '@/api/onboarding';
import { useToast } from '@/components/ToastContainer';
import ProgressStepper from '@/components/ProgressStepper';
import {
  SettingsIcon,
  ExpandMoreIcon,
  ArrowRightIcon,
  UnfoldMoreIcon,
  ChevronLeftIcon,
} from '@/assets/icons';
import './MetricConfigs.css';

const METRIC_TYPES = ['Counter', 'Gauge', 'Summary', 'Histogram'];

function MetricConfigForm({ isEdit = false }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(isEdit);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [anonymizeIP, setAnonymizeIP] = useState(true);
  const [realTimeWebhook, setRealTimeWebhook] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    metric_type: 'Counter',
  });
  // Optional fields (description, help_text, labels) – stored on edit so we preserve them on update
  const optionalFieldsRef = useRef({ description: '', help_text: '', labels: [] });

  // Fetch existing config data if editing
  useEffect(() => {
    if (isEdit && id) {
      fetchConfigData();
    }
  }, [isEdit, id]);

  const fetchConfigData = async () => {
    try {
      setFetchingData(true);
      const config = await metricConfigsAPI.getById(id);
      if (!config) {
        showToast('Configuration not found', 'error');
        navigate('/metric-configs');
        return;
      }

      setFormData({
        name: config.name || '',
        metric_type: config.metric_type
          ? config.metric_type.charAt(0).toUpperCase() + config.metric_type.slice(1)
          : 'Counter',
      });
      optionalFieldsRef.current = {
        description: config.description || '',
        help_text: config.help_text || '',
        labels: Array.isArray(config.labels) ? config.labels : [],
      };
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load configuration', 'error');
      navigate('/metric-configs');
    } finally {
      setFetchingData(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Generate metric_name from configuration name
  const generateMetricName = (name) => {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '') || 'metric'
    );
  };

  const getOptionalPayload = () => {
    if (isEdit) {
      const o = optionalFieldsRef.current;
      return {
        description: o.description || '',
        help_text: o.help_text || '',
        labels: Array.isArray(o.labels) ? o.labels : [],
      };
    }
    return { description: '', help_text: '', labels: [] };
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      const optional = getOptionalPayload();
      const payload = {
        name: formData.name,
        metric_name: generateMetricName(formData.name),
        metric_type: formData.metric_type.toLowerCase(),
        ...optional,
        status: 'draft',
      };

      if (isEdit && id) {
        await metricConfigsAPI.update(id, payload);
        showToast('Draft saved successfully!', 'success');
      } else {
        await metricConfigsAPI.create(payload);
        showToast('Draft saved successfully!', 'success');
      }
      navigate('/metric-configs');
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
      const optional = getOptionalPayload();
      const payload = {
        name: formData.name,
        metric_name: generateMetricName(formData.name),
        metric_type: formData.metric_type.toLowerCase(),
        ...optional,
        status: 'active',
      };

      if (isEdit && id) {
        await metricConfigsAPI.update(id, payload);
        showToast('Configuration updated successfully!', 'success');
        navigate('/metric-configs');
      } else {
        await metricConfigsAPI.create(payload);

        // ── Smart redirect ──────────────────────────────────────────
        // If the user already has an API key and completed onboarding,
        // go straight to the dashboard — the existing key + snippet
        // already covers this new metric automatically.
        try {
          const statusRes = await onboardingAPI.getStatus();
          const { has_api_key, is_setup_complete } = statusRes.data || {};

          if (is_setup_complete) {
            showToast(
              'Metric created! Your existing API key & snippet already cover it automatically.',
              'success',
              5000
            );
            navigate('/');
            return;
          }

          if (has_api_key) {
            showToast(
              'Metric created! Continue to generate your tracking snippet.',
              'success',
              4000
            );
            navigate('/code-generation');
            return;
          }
        } catch {
          // Fall through to default redirect if status check fails
        }

        // Default for brand-new users: go to API Keys step
        showToast('Metric configuration created successfully!', 'success');
        navigate('/api-keys');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to save configuration';
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/metric-configs');
  };

  if (fetchingData) {
    return (
      <div className="metric-configs-page">
        <div className="metric-configs-container">
          <div className="configs-loading">
            <div className="loading-spinner" />
            <p>Loading configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="metric-configs-page">
      <div className="metric-configs-container">
        {!isEdit && <ProgressStepper currentStep={1} />}

        <div className="metric-configs-header">
          {isEdit && (
            <button className="back-button" onClick={handleBack} type="button">
              <ChevronLeftIcon size={20} />
              Back to Configurations
            </button>
          )}
          <h1 className="metric-configs-title">
            {isEdit ? 'Edit Configuration' : 'Configure Your Metrics'}
          </h1>
          <p className="metric-configs-subtitle">
            {isEdit
              ? 'Update the settings for this metric configuration.'
              : 'Define the identity and context for your data stream.'}
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
                  required
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
                {isEdit ? 'Save as Draft' : 'Save as Draft'}
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {isEdit ? 'Save Changes' : 'Save & Continue'}
                {!isEdit && <ArrowRightIcon size={20} />}
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

export default MetricConfigForm;
