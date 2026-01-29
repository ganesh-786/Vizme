import { defaultSvgProps } from "./constants";

export function CheckIcon({ size = 30, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
