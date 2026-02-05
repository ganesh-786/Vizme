import './Skeleton.css';

/**
 * Skeleton - A flexible skeleton loading component
 * Designed to sync with the project's design system
 *
 * @param {string} variant - 'text' | 'title' | 'subtitle' | 'circle' | 'button' | 'card' | 'badge'
 * @param {string|number} width - CSS width value
 * @param {string|number} height - CSS height value
 * @param {number} stagger - Stagger index for animation delay (1-5)
 * @param {boolean} pulse - Use pulse animation instead of shimmer
 * @param {boolean} dark - Use dark variant for dark backgrounds
 * @param {boolean} inline - Display as inline-block
 * @param {string} className - Additional CSS classes
 * @param {object} style - Additional inline styles
 */
function Skeleton({
  variant = 'text',
  width,
  height,
  stagger,
  pulse = false,
  dark = false,
  inline = false,
  className = '',
  style = {},
}) {
  const classes = [
    'skeleton',
    `skeleton--${variant}`,
    pulse && 'skeleton--pulse',
    dark && 'skeleton--dark',
    inline && 'skeleton--inline',
    stagger && `skeleton--stagger-${Math.min(stagger, 5)}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const customStyle = {
    ...style,
    ...(width && { width: typeof width === 'number' ? `${width}px` : width }),
    ...(height && { height: typeof height === 'number' ? `${height}px` : height }),
  };

  return <div className={classes} style={customStyle} aria-hidden="true" />;
}

/**
 * SkeletonText - Renders multiple lines of skeleton text
 *
 * @param {number} lines - Number of lines to render
 * @param {string} gap - Gap between lines
 * @param {string} lastLineWidth - Width of the last line (typically shorter)
 */
function SkeletonText({ lines = 3, gap = '0.75rem', lastLineWidth = '60%' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? lastLineWidth : '100%'}
          stagger={i + 1}
        />
      ))}
    </div>
  );
}

/**
 * SkeletonTableRow - Renders a skeleton table row
 *
 * @param {number} columns - Number of columns
 * @param {number} index - Row index for stagger effect
 */
function SkeletonTableRow({ columns = 4, index = 0 }) {
  const stagger = (index % 5) + 1;

  return (
    <tr className="skeleton-row">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i}>
          <Skeleton width="80%" stagger={stagger} />
        </td>
      ))}
    </tr>
  );
}

export { Skeleton, SkeletonText, SkeletonTableRow };
export default Skeleton;
