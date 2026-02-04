import { defaultSvgProps } from './constants';

export function EyeOffIcon({ size = 20, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path
        d="M2.1 12c2.1-4.8 6-7.5 9.9-7.5S19.8 7.2 21.9 12c-2.1 4.8-6 7.5-9.9 7.5S4.2 16.8 2.1 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
