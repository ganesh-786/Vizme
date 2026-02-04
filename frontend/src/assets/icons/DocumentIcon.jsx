import { defaultSvgProps } from './constants';

export function DocumentIcon({ size = 22, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path d="M5 7h14v10H5z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
