import { defaultSvgProps } from './constants';

export function ChevronRightIcon({ size = 20, ...props }) {
  return (
    <svg {...defaultSvgProps} viewBox="0 0 24 24" width={size} height={size} {...props}>
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
