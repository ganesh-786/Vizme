/**
 * Centralized icon set.
 *
 * Production note:
 * - Keeping icons as React components (vs raw .svg files) preserves `currentColor`,
 *   makes sizing consistent, and avoids repeated inline SVG blocks across pages.
 */

const defaultSvgProps = {
  "aria-hidden": true,
  focusable: "false",
  fill: "none",
};

export function EyeOffIcon({ size = 20, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
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
      <path
        d="M4 20 20 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EyeIcon({ size = 20, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
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
    </svg>
  );
}

export function SunIcon({ size = 20, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
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

export function MoonIcon({ size = 20, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path
        d="M21 13.1A7.4 7.4 0 0 1 10.9 3a6.8 6.8 0 1 0 10.1 10.1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BellIcon({ size = 20, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13.8 19a1.8 1.8 0 0 1-3.6 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AnalyticsIcon({ size = 30, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 19H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 16V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function KeyIcon({ size = 30, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path
        d="M7.5 14.5a4.5 4.5 0 1 1 3.9-6.8h8.6v3h-2v2h-2v2h-3.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M7.5 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function PlusIcon({ size = 22, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path d="M12 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DocumentIcon({ size = 22, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path d="M5 7h14v10H5z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TrendUpIcon({ size = 22, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 19H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M7 15l3-3 3 2 5-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowRightIcon({ size = 20, ...props }) {
  return (
    <svg
      {...defaultSvgProps}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path d="M5 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
