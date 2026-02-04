import { defaultSvgProps } from './constants';

export function BarChartIcon({ size = 20, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path
        d="M3 3v18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="7" y="12" width="2" height="6" fill="currentColor" />
      <rect x="11" y="8" width="2" height="10" fill="currentColor" />
      <rect x="15" y="4" width="2" height="14" fill="currentColor" />
    </svg>
  );
}
