import { defaultSvgProps } from './constants';

export function KeyIcon({ size = 30, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path
        d="M7.5 14.5a4.5 4.5 0 1 1 3.9-6.8h8.6v3h-2v2h-2v2h-3.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M7.5 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
