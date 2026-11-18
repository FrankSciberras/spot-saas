import type { CSSProperties } from 'react';
import BoltMark from '@/components/shared/BoltMark';

/** The fields a logo tile needs — met by both the integrations and GPS catalogs. */
export interface IntegrationMarkSource {
  mark: string;
  bg: string;
  fg: string;
  logo?: 'bolt';
  logoSrc?: string;
}

/** Short text marks shrink so 2–3 characters still fit the tile. */
function markFontSize(mark: string, tile: number): number {
  const base = tile / 2;
  if (mark.length >= 3) return Math.round(base * 0.54);
  if (mark.length === 2) return Math.round(base * 0.71);
  return Math.round(base);
}

/**
 * Inline style for a logo tile. A partner's real logo sits on a white tile with
 * a hairline ring (it carries its own colours, and white reads in both themes,
 * like an app icon); anything else keeps its coloured tile and text mark.
 */
export function integrationTileStyle(it: IntegrationMarkSource, tile = 48): CSSProperties {
  if (it.logoSrc) {
    return { background: '#ffffff', color: it.fg, boxShadow: 'inset 0 0 0 1px rgba(15, 18, 26, 0.09)' };
  }
  return { background: it.bg, color: it.fg, fontSize: markFontSize(it.mark, tile) };
}

/**
 * What goes inside the tile: the partner logo, the Bolt mark, or the text mark.
 * The tile element itself (size, radius, centring) stays with each page.
 */
export default function IntegrationMark({ it, tile = 48 }: { it: IntegrationMarkSource; tile?: number }) {
  if (it.logo === 'bolt') return <BoltMark size={Math.round(tile * 0.58)} />;
  if (it.logoSrc) {
    const px = Math.round(tile * 0.62);
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG/PNG; next/image adds nothing here
      <img src={it.logoSrc} alt="" width={px} height={px} style={{ width: px, height: px, objectFit: 'contain', display: 'block' }} />
    );
  }
  return <>{it.mark}</>;
}
