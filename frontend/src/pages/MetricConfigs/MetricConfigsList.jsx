import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { metricConfigsAPI } from '@/api/metricConfigs';
import { useToast } from '@/components/ToastContainer';
import { useConfirm } from '@/components/ConfirmModal';
import { PlusIcon, EditIcon, CopyIcon, ArchiveIcon, DeleteIcon } from '@/assets/icons';
import MetricConfigsListSkeleton from './MetricConfigsListSkeleton';
import './MetricConfigsList.css';

// Label color mapping based on label content
const getLabelStyle = (labelName) => {
  const name = (labelName || '').toLowerCase();
  if (name.includes('prod') || name.includes('production')) {
    return 'label-blue';
  }
  if (name.includes('staging') || name.includes('stage')) {
    return 'label-purple';
  }
  if (name.includes('legacy') || name.includes('deprecated')) {
    return 'label-amber';
  }
  if (name.includes('network') || name.includes('crucial') || name.includes('critical')) {
    return 'label-slate';
  }
  return 'label-slate';
};

// Parse labels - handles both string (JSON) and array formats
const parseLabels = (labels) => {
  if (!labels) return [];
  if (Array.isArray(labels)) return labels;
  if (typeof labels === 'string') {
    try {
      const parsed = JSON.parse(labels);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Get display text for a label
const getLabelText = (label) => {
  if (!label) return '';
  // Handle different label formats: {name, value} or {key, value}
  return label.name || label.key || label.value || '';
};

// Status badge component
const StatusBadge = ({ status }) => {
  const normalized = status === 'active' ? 'active' : status === 'draft' ? 'draft' : 'paused';
  const label = normalized === 'active' ? 'Active' : normalized === 'draft' ? 'Draft' : 'Paused';
  return (
    <span className={`status-badge status-${normalized}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
};

function MetricConfigsList() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const data = await metricConfigsAPI.getAll();
      setConfigs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch configs:', err);
      showToast('Failed to load configurations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    navigate('/metric-configs/new');
  };

  const handleEdit = (id) => {
    navigate(`/metric-configs/${id}/edit`);
  };

  const handleClone = async (config) => {
    try {
      const clonedData = {
        name: `${config.name} (Copy)`,
        metric_name: `${config.metric_name}_copy`,
        metric_type: config.metric_type,
        description: config.description,
        help_text: config.help_text,
        labels: parseLabels(config.labels),
      };
      await metricConfigsAPI.create(clonedData);
      showToast('Configuration cloned successfully!', 'success');
      fetchConfigs();
    } catch (err) {
      showToast('Failed to clone configuration', 'error');
    }
  };

  const handleArchive = async (id) => {
    try {
      await metricConfigsAPI.update(id, { status: 'paused' });
      showToast('Configuration archived successfully!', 'success');
      fetchConfigs();
    } catch (err) {
      showToast('Failed to archive configuration', 'error');
    }
  };

  const handleDelete = async (config) => {
    const confirmed = await confirm({
      title: 'Delete configuration',
      message: `Are you sure you want to permanently delete "${config.name}"? This cannot be undone.`,
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    try {
      await metricConfigsAPI.delete(config.id);
      showToast('Configuration deleted successfully.', 'success');
      fetchConfigs();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete configuration', 'error');
    }
  };

  // Format metric type for display
  const formatMetricType = (type) => {
    if (!type) return 'Unknown';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Pagination
  const totalPages = Math.ceil(configs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedConfigs = configs.slice(startIndex, startIndex + itemsPerPage);

  if (loading) {
    return <MetricConfigsListSkeleton />;
  }

  return (
    <div className="configs-list-page">
      <div className="configs-list-container">
        {/* Header */}
        <div className="configs-list-header">
          <div className="configs-list-header-text">
            <h1 className="configs-list-title">Metric Configurations</h1>
            <p className="configs-list-subtitle">
              Manage and monitor your existing engineering data feeds.
            </p>
          </div>
          <button className="btn-create-new" onClick={handleCreateNew}>
            <PlusIcon size={20} />
            Create New Configuration
          </button>
        </div>

        {/* Table */}
        <div className="configs-table-wrapper">
          <div className="configs-table-scroll">
            <table className="configs-table">
              <thead>
                <tr>
                  <th>Config Name</th>
                  <th>Metric Type</th>
                  <th>Status</th>
                  <th className="actions-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedConfigs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="empty-state">
                      <p>No configurations found.</p>
                      <button className="btn-create-new-inline" onClick={handleCreateNew}>
                        Create your first configuration
                      </button>
                    </td>
                  </tr>
                ) : (
                  paginatedConfigs.map((config) => (
                    <tr key={config.id} className={config.status === 'paused' ? 'row-paused' : ''}>
                      <td className="config-name-cell">
                        <span className="config-name">{config.name}</span>
                      </td>
                      <td className="config-type-cell">{formatMetricType(config.metric_type)}</td>
                      <td className="config-status-cell">
                        <StatusBadge status={config.status || 'active'} />
                      </td>
                      <td className="config-actions-cell">
                        <div className="actions-wrapper">
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => handleEdit(config.id)}
                            title="Edit"
                            aria-label="Edit configuration"
                          >
                            <EditIcon size={18} />
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => handleClone(config)}
                            title="Clone"
                            aria-label="Clone configuration"
                          >
                            <CopyIcon size={18} />
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => handleArchive(config.id)}
                            title="Archive"
                            aria-label="Archive configuration"
                          >
                            <ArchiveIcon size={18} />
                          </button>
                          <button
                            type="button"
                            className="action-btn action-btn-danger"
                            onClick={() => handleDelete(config)}
                            title="Delete"
                            aria-label="Delete configuration"
                          >
                            <DeleteIcon size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {configs.length > 0 && (
            <div className="configs-table-footer">
              <p className="configs-count">
                Showing {paginatedConfigs.length} configuration
                {paginatedConfigs.length !== 1 ? 's' : ''}
                {configs.length > itemsPerPage && ` of ${configs.length}`}
              </p>
              {totalPages > 1 && (
                <div className="pagination-controls">
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Help text */}
        <p className="configs-help-text">
          Need help managing configurations?{' '}
          <a href="#" className="help-link">
            Read the admin guide
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

export default MetricConfigsList;
