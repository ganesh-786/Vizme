import { defaultSvgProps } from './constants';

export function SunIcon({ size = 20, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path
        d="M12 3v2.2M12 18.8V21M4.2 12H3M21 12h-1.2M6 6l-1.6-1.6M19.6 19.6 18 18M18 6l1.6-1.6M4.4 19.6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
