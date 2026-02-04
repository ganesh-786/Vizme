import { defaultSvgProps } from './constants';

export function AnalyticsIcon({ size = 30, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 19H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 16V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
