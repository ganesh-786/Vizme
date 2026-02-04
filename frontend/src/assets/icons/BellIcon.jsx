import { defaultSvgProps } from './constants';

export function BellIcon({ size = 20, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13.8 19a1.8 1.8 0 0 1-3.6 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
