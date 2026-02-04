import { defaultSvgProps } from './constants';

export function LockIcon({ size = 30, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <rect
        x="3"
        y="11"
        width="18"
        height="11"
        rx="2"
        ry="2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
