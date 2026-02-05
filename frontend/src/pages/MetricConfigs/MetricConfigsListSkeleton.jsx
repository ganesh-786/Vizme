import { Skeleton } from '@/components/Skeleton';
import './MetricConfigsList.css';

/**
 * MetricConfigsListSkeleton - Skeleton loading state for MetricConfigsList
 * Matches the exact layout and dimensions of the actual content
 */
function MetricConfigsListSkeleton() {
  return (
    <div className="configs-list-page">
      <div className="configs-list-container">
        {/* Header Skeleton */}
        <div className="configs-list-header">
          <div className="configs-list-header-text">
            <Skeleton variant="title" width="320px" height="2.25rem" />
            <Skeleton
              variant="subtitle"
              width="380px"
              height="1.125rem"
              style={{ marginTop: '0.5rem' }}
            />
          </div>
          <Skeleton variant="button" width="240px" height="48px" />
        </div>

        {/* Table Skeleton */}
        <div className="configs-table-wrapper">
          <div className="configs-table-scroll">
            <table className="configs-table">
              <thead>
                <tr>
                  <th>Config Name</th>
                  <th>Metric Type</th>
                  <th>Description</th>
                  <th>Labels</th>
                  <th>Status</th>
                  <th className="actions-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="config-name-cell">
                      <Skeleton width="140px" height="16px" stagger={(i % 5) + 1} />
                    </td>
                    <td className="config-type-cell">
                      <Skeleton width="80px" height="16px" stagger={(i % 5) + 1} />
                    </td>
                    <td className="config-description-cell">
                      <Skeleton width="180px" height="14px" stagger={(i % 5) + 1} />
                    </td>
                    <td className="config-labels-cell">
                      <div className="labels-wrapper">
                        <Skeleton
                          variant="badge"
                          width="55px"
                          height="20px"
                          stagger={(i % 5) + 1}
                        />
                        <Skeleton
                          variant="badge"
                          width="48px"
                          height="20px"
                          stagger={(i % 5) + 1}
                        />
                      </div>
                    </td>
                    <td className="config-status-cell">
                      <Skeleton variant="badge" width="72px" height="24px" stagger={(i % 5) + 1} />
                    </td>
                    <td className="config-actions-cell">
                      <div className="actions-wrapper">
                        <Skeleton
                          variant="circle"
                          width="32px"
                          height="32px"
                          stagger={(i % 5) + 1}
                        />
                        <Skeleton
                          variant="circle"
                          width="32px"
                          height="32px"
                          stagger={(i % 5) + 1}
                        />
                        <Skeleton
                          variant="circle"
                          width="32px"
                          height="32px"
                          stagger={(i % 5) + 1}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer Skeleton */}
          <div className="configs-table-footer">
            <Skeleton width="200px" height="14px" />
            <div className="pagination-controls">
              <Skeleton width="80px" height="32px" style={{ borderRadius: '0.5rem' }} />
              <Skeleton width="80px" height="32px" style={{ borderRadius: '0.5rem' }} />
            </div>
          </div>
        </div>

        {/* Help Text Skeleton */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
          <Skeleton width="360px" height="14px" />
        </div>
      </div>
    </div>
  );
}

export default MetricConfigsListSkeleton;
