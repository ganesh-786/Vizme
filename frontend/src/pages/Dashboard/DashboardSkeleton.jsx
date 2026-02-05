import { Skeleton } from '@/components/Skeleton';
import './Dashboard.css';

/**
 * DashboardSkeleton - Skeleton loading state for Dashboard page
 * Matches the exact layout and dimensions of the actual content
 */
function DashboardSkeleton() {
  return (
    <div className="dashboard">
      {/* Header Skeleton */}
      <div className="dashboard-header">
        <Skeleton width="320px" height="2.5rem" style={{ borderRadius: '0.5rem' }} />
        <Skeleton width="480px" height="1.125rem" style={{ marginTop: '0.75rem' }} />
      </div>

      {/* Overview Cards Grid */}
      <div className="overview-grid">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="overview-card" style={{ pointerEvents: 'none' }}>
            <div style={{ flex: 1 }}>
              <Skeleton width="160px" height="12px" stagger={i + 1} />
              <div className="overview-metric" style={{ marginTop: '0.75rem' }}>
                <Skeleton width="56px" height="2.5rem" stagger={i + 1} />
                <Skeleton
                  width="50px"
                  height="1.125rem"
                  stagger={i + 1}
                  style={{ marginLeft: '0.5rem' }}
                />
              </div>
              <div
                className="overview-note"
                style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}
              >
                <Skeleton variant="circle" width="8px" height="8px" stagger={i + 1} />
                <Skeleton width="160px" height="14px" stagger={i + 1} />
              </div>
            </div>
            <Skeleton
              width="56px"
              height="56px"
              stagger={i + 1}
              style={{ borderRadius: '16px', flexShrink: 0 }}
            />
          </div>
        ))}
      </div>

      {/* Quick Start Guide Section */}
      <section className="quickstart" style={{ pointerEvents: 'none' }}>
        <div className="quickstart-head">
          <Skeleton width="180px" height="1.5rem" />
          <Skeleton variant="badge" width="200px" height="28px" />
        </div>

        <div className="timeline">
          <div className="timeline-line" aria-hidden="true" />

          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="timeline-item">
              <Skeleton
                variant="circle"
                width="48px"
                height="48px"
                stagger={i + 1}
                style={{ flexShrink: 0, zIndex: 2 }}
              />
              <div className="timeline-content" style={{ flex: 1, paddingTop: '4px' }}>
                <Skeleton width="140px" height="1.125rem" stagger={i + 1} />
                <Skeleton
                  width="100%"
                  height="14px"
                  stagger={i + 1}
                  style={{ marginTop: '0.5rem', maxWidth: '420px' }}
                />
                <Skeleton
                  width="85%"
                  height="14px"
                  stagger={i + 1}
                  style={{ marginTop: '0.25rem', maxWidth: '360px' }}
                />
                <Skeleton
                  width="140px"
                  height="36px"
                  stagger={i + 1}
                  style={{ marginTop: '0.75rem', borderRadius: '10px' }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer Skeleton */}
      <footer className="dashboard-footer" style={{ pointerEvents: 'none' }}>
        <div className="footer-left">
          <Skeleton width="220px" height="14px" />
          <Skeleton variant="circle" width="4px" height="4px" />
          <Skeleton width="100px" height="14px" />
        </div>
        <div className="footer-right">
          <Skeleton width="100px" height="14px" />
          <Skeleton width="100px" height="14px" />
          <Skeleton width="80px" height="14px" />
        </div>
      </footer>
    </div>
  );
}

export default DashboardSkeleton;
