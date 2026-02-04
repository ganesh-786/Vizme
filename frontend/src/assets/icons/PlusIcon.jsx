import { defaultSvgProps } from './constants';

export function PlusIcon({ size = 22, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path d="M12 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
