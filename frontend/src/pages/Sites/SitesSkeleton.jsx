import { Skeleton, SkeletonText } from '@/components/Skeleton';
import './Sites.css';

function SitesSkeleton() {
  return (
    <div className="sites-page" aria-busy="true" aria-live="polite">
      <span className="sites-page__sr-only">Loading properties…</span>
      <Skeleton variant="title" width="180px" height="1.5rem" />
      <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem', maxWidth: '560px' }}>
        <SkeletonText lines={2} gap="0.5rem" lastLineWidth="85%" />
      </div>

      <div className="sites-page__form">
        <Skeleton height="38px" style={{ flex: 1, minWidth: 200, borderRadius: '8px' }} stagger={1} />
        <Skeleton variant="button" width="132px" height="38px" stagger={2} style={{ borderRadius: '8px' }} />
      </div>

      <ul className="sites-page__list">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="sites-page__row">
            <Skeleton width="55%" height="16px" stagger={(i % 5) + 1} style={{ flex: 1 }} />
            <Skeleton width="72px" height="12px" stagger={(i % 5) + 1} />
            <Skeleton width="52px" height="14px" stagger={(i % 5) + 1} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SitesSkeleton;
