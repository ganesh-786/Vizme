import { Skeleton } from '@/components/Skeleton';
import ProgressStepper from '@/components/ProgressStepper';
import './ApiKeys.css';

/**
 * ApiKeysSkeleton - Skeleton loading state for ApiKeys page
 * Matches the exact layout and dimensions of the actual content
 */
function ApiKeysSkeleton() {
  return (
    <div className="apikeys-page">
      <ProgressStepper currentStep={2} />

      {/* Main Card */}
      <div className="apikeys-card">
        {/* Header */}
        <div className="apikeys-header">
          <div className="apikeys-header-content">
            <Skeleton variant="title" width="320px" height="1.875rem" />
            <Skeleton
              variant="subtitle"
              width="300px"
              height="1rem"
              style={{ marginTop: '0.5rem' }}
            />
          </div>
          <Skeleton variant="button" width="120px" height="42px" />
        </div>

        {/* Content */}
        <div className="apikeys-content">
          <div className="apikeys-grid">
            <div className="secret-key-panel">
              <div className="secret-key-header">
                <Skeleton dark width="100px" height="12px" />
              </div>

              <div className="secret-key-display">
                <Skeleton dark width="100%" height="24px" />
                <div className="key-actions-inline">
                  <Skeleton dark variant="circle" width="40px" height="40px" />
                  <Skeleton dark variant="circle" width="40px" height="40px" />
                </div>
              </div>

              <div className="security-icons">
                <Skeleton dark variant="circle" width="32px" height="32px" />
                <div className="icon-divider" />
                <Skeleton dark variant="circle" width="32px" height="32px" />
                <div className="icon-divider" />
                <Skeleton dark variant="circle" width="32px" height="32px" />
              </div>
            </div>
          </div>

          {/* Existing Keys Table */}
          <div className="existing-keys-section">
            <div className="existing-keys-header">
              <Skeleton width="160px" height="1.125rem" />
              <div className="existing-keys-header-actions">
                <Skeleton width="130px" height="20px" style={{ borderRadius: '0.25rem' }} />
                <Skeleton width="140px" height="40px" style={{ borderRadius: '0.5rem' }} />
              </div>
            </div>

            <div className="keys-table-container">
              <table className="keys-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key (Masked)</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td>
                        <div className="key-name-cell">
                          <Skeleton width="130px" height="14px" stagger={i + 1} />
                          <Skeleton
                            width="90px"
                            height="10px"
                            stagger={i + 1}
                            style={{ marginTop: '0.25rem' }}
                          />
                        </div>
                      </td>
                      <td>
                        <Skeleton width="150px" height="14px" stagger={i + 1} />
                      </td>
                      <td className="text-right">
                        <Skeleton
                          width="60px"
                          height="28px"
                          stagger={i + 1}
                          style={{ borderRadius: '0.5rem', marginLeft: 'auto' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="apikeys-footer">
          <Skeleton width="130px" height="14px" />
          <div className="footer-actions">
            <Skeleton width="100px" height="42px" style={{ borderRadius: '0.75rem' }} />
            <Skeleton width="160px" height="42px" style={{ borderRadius: '0.75rem' }} />
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="feature-cards">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="feature-card">
            <Skeleton variant="circle" width="24px" height="24px" stagger={i + 1} />
            <Skeleton width="140px" height="1rem" stagger={i + 1} style={{ marginTop: '0.5rem' }} />
            <Skeleton width="100%" height="14px" stagger={i + 1} style={{ marginTop: '0.5rem' }} />
            <Skeleton width="90%" height="14px" stagger={i + 1} style={{ marginTop: '0.25rem' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ApiKeysSkeleton;
