import { defaultSvgProps } from './constants';

export function MoonIcon({ size = 20, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path
        d="M21 13.1A7.4 7.4 0 0 1 10.9 3a6.8 6.8 0 1 0 10.1 10.1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
