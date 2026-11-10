import type { CSSProperties } from 'react';

/**
 * The Bolt logomark — the "o" ring from the Bolt wordmark with its dot
 * underneath. Used wherever Rovora points at the Bolt integration (the
 * /fleet/bolt page, the integrations tiles). Drawn in `currentColor`, so the
 * parent decides the colour: white on the Bolt-green tile, or Bolt green on a
 * plain background.
 *
 * `size` is the HEIGHT in pixels; the mark is taller than it is wide.
 */
export const BOLT_GREEN = '#34d186';

export default function BoltMark({
  size = 24,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 640 916"
      width={(size * 640) / 916}
      height={size}
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
      style={style}
    >
      {/* Ring: outer radius 320, inner radius 104. */}
      <circle cx="320" cy="320" r="212" stroke="currentColor" strokeWidth="216" />
      <circle cx="320" cy="812" r="104" fill="currentColor" />
    </svg>
  );
}
