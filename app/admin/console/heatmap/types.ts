// =============================================================================
// Admin Console → Analytics → Heatmaps: the shapes /api/admin/analytics/heatmap
// returns (see analytics_heatmap() in supabase/migrations/20261124_heatmaps.sql)
// and the decoded click the viewer works with.
// =============================================================================

export type Layout = 'phone' | 'tablet' | 'desktop';

export const LAYOUTS: { id: Layout; label: string; short: string }[] = [
  { id: 'desktop', label: 'Desktop', short: 'Desktop' },
  { id: 'tablet', label: 'Tablet', short: 'Tablet' },
  { id: 'phone', label: 'Phone', short: 'Phone' },
];

/** Same split as the SQL: phones < 601 px wide, tablets < 1024 px. */
export const layoutOf = (vw: number): Layout => (vw < 601 ? 'phone' : vw < 1024 ? 'tablet' : 'desktop');

/** The width a layout is drawn at when its visitors' own widths are unknown. */
const DEFAULT_WIDTH: Record<Layout, number> = { phone: 390, tablet: 820, desktop: 1440 };
const WIDTH_RANGE: Record<Layout, [number, number]> = { phone: [320, 600], tablet: [601, 1023], desktop: [1024, 1920] };

/** Draw at the most common real width in that group, so the page looks like it did for them. */
export function renderWidth(layout: Layout, clicks: Click[]): number {
  const widths = clicks.map((c) => c.vw).filter((w) => layoutOf(w) === layout);
  if (!widths.length) return DEFAULT_WIDTH[layout];
  const counts = new Map<number, number>();
  for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best = DEFAULT_WIDTH[layout];
  let n = 0;
  for (const [w, c] of counts) if (c > n) { best = w; n = c; }
  const [lo, hi] = WIDTH_RANGE[layout];
  return Math.min(hi, Math.max(lo, best));
}

export interface HeatPageRow {
  path: string;
  clicks: number;
  visits: number;
  views: number;
  rage: number;
  dead: number;
  phone: number;
  tablet: number;
  desktop: number;
  last_at: string;
}

export interface HeatPagesData {
  pages: HeatPageRow[];
  totals: { clicks: number; visits: number; pages: number; rage: number; dead: number; phone: number; tablet: number; desktop: number; last_at: string | null };
  generatedAt: string;
}

/** One clicked element: CSS path, tag, label, link target. */
export interface HeatElement { s: string; t: string | null; l: string | null; h: string | null }
/** One visit that clicked: device, country, source, channel, start, browser. */
export interface HeatVisit { d: string; c: string | null; src: string; ch: string | null; at: string; b: string | null }

/** [epoch ms, x, y, dw, dh, vw, element, rx, ry, flags, ms since page opened, visit] */
export type RawClick = [number, number, number, number, number, number, number, number, number, number, number, number];

export interface HeatPageData {
  layouts: Record<Layout, number>;
  /** Clicks in the window before the 20 000 cap. */
  total: number;
  elements: HeatElement[];
  visits: HeatVisit[];
  clicks: RawClick[];
  page: {
    views: number;
    visits: number;
    engaged_ms: number;
    scroll: number;
    measured: number;
    /** reach[k] = page views that scrolled to at least k × 5 % of the page. */
    reach: number[] | null;
  };
  generatedAt: string;
}

export interface Click {
  t: number;
  x: number;
  y: number;
  dw: number;
  dh: number;
  vw: number;
  el: number;
  rx: number;
  ry: number;
  rage: boolean;
  dead: boolean;
  /** ms since the page opened, or -1 when unknown. */
  ms: number;
  visit: number;
}

export function decodeClicks(raw: RawClick[]): Click[] {
  return raw.map((r) => ({
    t: r[0], x: r[1], y: r[2], dw: r[3], dh: r[4], vw: r[5], el: r[6], rx: r[7], ry: r[8],
    rage: (r[9] & 1) === 1, dead: (r[9] & 2) === 2, ms: r[10], visit: r[11],
  }));
}

/** A readable name for an element: its label, else link target, else tag. */
export function elementName(e: HeatElement | undefined): string {
  if (!e) return 'Unknown';
  if (e.l) return e.l;
  if (e.h) return e.h;
  const tag = e.t ?? 'element';
  const last = e.s.split('>').pop() ?? '';
  return last.startsWith('#') ? `${tag} ${last}` : TAG_NAMES[tag] ?? tag;
}

/** Roughly where on the page an element sits, from its CSS path. */
export function elementWhere(e: HeatElement | undefined): string | null {
  if (!e) return null;
  const parts = e.s.split('>');
  if (parts.some((p) => p.startsWith('header') || p.startsWith('nav'))) return 'top menu';
  if (parts.some((p) => p.startsWith('footer'))) return 'footer';
  if (parts.some((p) => p.startsWith('dialog'))) return 'pop-up';
  if (parts[0]?.startsWith('#')) return `${parts[0].slice(1).replace(/[-_]/g, ' ')} section`;
  return null;
}

/** "Start free trial · top menu → /login" — enough to tell twins apart. */
export function elementDetail(e: HeatElement | undefined): string | undefined {
  if (!e) return undefined;
  return [elementWhere(e), e.h && e.h !== e.l ? `→ ${e.h}` : null].filter(Boolean).join(' · ') || undefined;
}

const TAG_NAMES: Record<string, string> = {
  a: 'Link', button: 'Button', img: 'Image', p: 'Text', span: 'Text', div: 'Area', section: 'Section background',
  h1: 'Main heading', h2: 'Heading', h3: 'Heading', li: 'List item', input: 'Form field', textarea: 'Text box',
  video: 'Video', svg: 'Icon', path: 'Icon', label: 'Form label', body: 'Page background', main: 'Page background',
};
