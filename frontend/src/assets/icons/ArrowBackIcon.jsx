import { defaultSvgProps } from "./constants";

export function ArrowBackIcon({ size = 30, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path
        d="m12 19-7-7 7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 12H5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
