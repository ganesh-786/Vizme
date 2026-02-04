import { defaultSvgProps } from './constants';

export function HubIcon({ size = 30, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v7M12 15v7M4.93 4.93l4.95 4.95M14.12 14.12l4.95 4.95M2 12h7M15 12h7M4.93 19.07l4.95-4.95M14.12 9.88l4.95-4.95"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
