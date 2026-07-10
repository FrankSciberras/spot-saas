// Shared document / attachment icons — plain stroke SVGs (no emojis), used
// across the driver & vehicle forms and detail views so the whole app shows the
// same clean icons. Size via the `size` prop (px); colour inherits from the
// parent (stroke: currentColor).
import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function Icon({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Attach / upload a file. Replaces the old 📎 emoji everywhere. */
export function PaperclipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.49" />
    </Icon>
  );
}

/** A saved/viewable document. Replaces the old 📄 emoji. */
export function DocumentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  );
}

/** Insurance. Replaces 🛡️. */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l7 3v5c0 4.6-3.1 7.7-7 9-3.9-1.3-7-4.4-7-9V6l7-3z" />
    </Icon>
  );
}

/** Road / operating licence. Replaces 📋. */
export function RoadLicenseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.2L8 21l4-2 4 2-1-7.8" />
    </Icon>
  );
}

/** Logbook. Replaces 📖. */
export function LogbookIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v16H7.5A2.5 2.5 0 0 0 5 20.5V4.5z" />
      <path d="M9 6.5h7M9 10h5" />
    </Icon>
  );
}

/** Other / misc documents. Replaces 📁. */
export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </Icon>
  );
}
