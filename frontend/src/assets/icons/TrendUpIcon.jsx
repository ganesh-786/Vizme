import { defaultSvgProps } from './constants';

export function TrendUpIcon({ size = 22, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 19H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M7 15l3-3 3 2 5-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
