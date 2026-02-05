import { Skeleton } from '@/components/Skeleton';
import ProgressStepper from '@/components/ProgressStepper';
import './CodeGeneration.css';

/**
 * CodeGenerationSkeleton - Skeleton loading state for CodeGeneration page
 * Matches the exact layout and dimensions of the actual content
 */
function CodeGenerationSkeleton() {
  return (
    <div className="code-generation-page">
      {/* Header Section */}
      <div className="cg-header">
        <Skeleton width="320px" height="2.25rem" style={{ margin: '0 auto' }} />
        <Skeleton
          width="100%"
          height="1.125rem"
          style={{ marginTop: '0.5rem', maxWidth: '42rem', margin: '0.5rem auto 0' }}
        />
        <Skeleton
          width="80%"
          height="1.125rem"
          style={{ maxWidth: '34rem', margin: '0.25rem auto 0' }}
        />
      </div>

      {/* Progress Stepper */}
      <ProgressStepper currentStep={3} />

      {/* Config Info Badge Skeleton */}
      <div className="cg-config-info">
        <Skeleton variant="badge" width="280px" height="36px" />
      </div>

      {/* Main Content Grid */}
      <div className="cg-content-grid">
        {/* Left Column */}
        <div className="cg-left-column">
          {/* Framework Tabs Skeleton */}
          <div className="cg-framework-tabs" style={{ pointerEvents: 'none' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="cg-framework-tab" style={{ background: 'transparent' }}>
                <Skeleton width="24px" height="16px" stagger={i + 1} />
                <Skeleton width="60px" height="14px" stagger={i + 1} />
              </div>
            ))}
          </div>

          {/* Code Box Skeleton */}
          <div className="cg-code-box">
            <div className="cg-code-header">
              <div className="cg-window-controls">
                <span className="cg-control red"></span>
                <span className="cg-control yellow"></span>
                <span className="cg-control green"></span>
              </div>
              <Skeleton dark width="120px" height="12px" />
              <Skeleton width="100px" height="28px" style={{ borderRadius: '0.5rem' }} />
            </div>
            <div className="cg-code-content" style={{ minHeight: '300px' }}>
              {/* Code skeleton lines */}
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton
                  key={i}
                  dark
                  width={`${Math.random() * 40 + 50}%`}
                  height="14px"
                  stagger={(i % 5) + 1}
                  style={{ marginBottom: '0.75rem' }}
                />
              ))}
            </div>
          </div>

          {/* Tracking Configuration Skeleton */}
          <div className="cg-tracking-config" style={{ pointerEvents: 'none' }}>
            <div className="cg-config-title">
              <Skeleton width="24px" height="24px" style={{ borderRadius: '4px' }} />
              <Skeleton width="180px" height="1.125rem" />
            </div>
            <div className="cg-config-options">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="cg-config-option" style={{ cursor: 'default' }}>
                  <Skeleton variant="circle" width="20px" height="20px" stagger={i + 1} />
                  <div className="cg-option-text">
                    <Skeleton width="120px" height="14px" stagger={i + 1} />
                    <Skeleton
                      width="200px"
                      height="12px"
                      stagger={i + 1}
                      style={{ marginTop: '0.25rem' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="cg-right-column">
          {/* Connection Status Card Skeleton */}
          <div className="cg-status-card" style={{ pointerEvents: 'none' }}>
            <div className="cg-status-header">
              <Skeleton width="120px" height="10px" />
              <Skeleton variant="circle" width="10px" height="10px" />
            </div>
            <div className="cg-status-content">
              <Skeleton variant="circle" width="48px" height="48px" style={{ marginBottom: '0.5rem' }} />
              <Skeleton width="140px" height="16px" style={{ marginBottom: '0.25rem' }} />
              <Skeleton width="200px" height="12px" />
            </div>
            <div className="cg-status-actions">
              <Skeleton width="100%" height="44px" style={{ borderRadius: '0.75rem' }} />
              <Skeleton width="100%" height="10px" style={{ marginTop: '0.5rem' }} />
            </div>
          </div>

          {/* Help Card Skeleton */}
          <div className="cg-help-card" style={{ pointerEvents: 'none' }}>
            <Skeleton variant="circle" width="24px" height="24px" style={{ flexShrink: 0 }} />
            <div className="cg-help-content">
              <Skeleton width="80px" height="14px" />
              <Skeleton width="100%" height="12px" style={{ marginTop: '0.25rem' }} />
              <Skeleton width="80%" height="12px" style={{ marginTop: '0.25rem' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions Skeleton */}
      <div className="cg-footer-actions" style={{ pointerEvents: 'none' }}>
        <Skeleton width="150px" height="14px" />
        <Skeleton width="180px" height="52px" style={{ borderRadius: '0.75rem' }} />
      </div>

      {/* Trust Section Skeleton */}
      <div className="cg-trust-section" style={{ pointerEvents: 'none' }}>
        <Skeleton width="300px" height="10px" />
        <div className="cg-trust-logos">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              width={`${4 + i}rem`}
              height="1.5rem"
              stagger={i + 1}
              style={{ borderRadius: '4px' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default CodeGenerationSkeleton;
