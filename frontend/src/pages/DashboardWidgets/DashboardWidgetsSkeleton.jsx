import { Skeleton } from '@/components/Skeleton';
import './DashboardWidgets.css';

function DashboardWidgetsSkeleton() {
  return (
    <div className="dw-page" aria-busy="true" aria-live="polite">
      <span className="dw-page__sr-only">Loading dashboard widgets…</span>

      <div className="dw-page__head">
        <div>
          <Skeleton variant="title" width="260px" height="1.5rem" />
          <div style={{ marginTop: '0.5rem', maxWidth: '40rem' }}>
            <Skeleton width="100%" height="14px" stagger={1} style={{ marginBottom: '0.35rem' }} />
            <Skeleton width="92%" height="14px" stagger={2} />
          </div>
        </div>
        <Skeleton
          variant="button"
          width="108px"
          height="36px"
          stagger={3}
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div className="dw-page__filters">
        <div className="dw-page__filter">
          <Skeleton width="48px" height="12px" stagger={1} />
          <Skeleton
            width="280px"
            height="34px"
            stagger={2}
            style={{ borderRadius: '8px', maxWidth: '280px' }}
          />
        </div>
      </div>

      <table className="dw-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Metric</th>
            <th>Query</th>
            <th>Site</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td>
                <Skeleton width="120px" height="14px" stagger={(i % 5) + 1} />
              </td>
              <td>
                <Skeleton width="100px" height="14px" stagger={(i % 5) + 1} />
              </td>
              <td>
                <Skeleton width="72px" height="14px" stagger={(i % 5) + 1} />
              </td>
              <td>
                <Skeleton width="40px" height="14px" stagger={(i % 5) + 1} />
              </td>
              <td className="dw-table__actions">
                <Skeleton width="36px" height="14px" stagger={(i % 5) + 1} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DashboardWidgetsSkeleton;
