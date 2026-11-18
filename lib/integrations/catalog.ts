// Single source of truth for the integrations marketplace, shared by the public
// marketing page (/integrations) and the fleet dashboard (/fleet/integrations).
// Only connections that work today are listed here; what is planned lives on
// the public roadmap (components/marketing/roadmap/roadmap.ts). We don't ship
// the real third-party marks (trademarks), so each tile uses a short mark and
// brand-ish colours instead.

export type IntegrationStatus = 'live' | 'coming-soon';

export interface Integration {
  /** Display name, e.g. "Teltonika Trackers". */
  name: string;
  /** Short mark shown in the logo tile (1–3 chars), e.g. "W", "qb", "CSV". */
  mark: string;
  /** Logo tile background colour. */
  bg: string;
  /** Logo tile foreground (mark) colour. */
  fg: string;
  /** One-line description of what the connection does. */
  desc: string;
  status: IntegrationStatus;
  /** Where a LIVE integration opens inside the dashboard (e.g. '/fleet/financials'). */
  href?: string;
  /** Public page that explains it (shown as "Learn more" on /integrations). */
  more?: string;
  /**
   * A real logomark to draw in the tile instead of the text `mark` — only for
   * integrations that are actually live. Rendered by components/shared
   * (currently just 'bolt' → BoltMark), in the tile's `fg` colour.
   */
  logo?: 'bolt';
}

export interface IntegrationCategory {
  key: string;
  /** Section heading, e.g. "GPS & telematics". */
  title: string;
  /** Short supporting line under the heading. */
  blurb: string;
  items: Integration[];
}

/** Marketing/support address for "request an integration" links. */
export const INTEGRATIONS_CONTACT = 'hello@rovora.eu';

export const REQUEST_INTEGRATION_MAILTO =
  `mailto:${INTEGRATIONS_CONTACT}?subject=${encodeURIComponent('Integration request')}`;

/** Build a mailto asking to be notified when a specific integration ships. */
export function notifyMailto(name: string): string {
  const subject = encodeURIComponent(`Early access: ${name} integration`);
  const body = encodeURIComponent(
    `Hi Rovora team,\n\nI'd like to be notified when the ${name} integration is available.\n\nThanks!`,
  );
  return `mailto:${INTEGRATIONS_CONTACT}?subject=${subject}&body=${body}`;
}

/** Logo tiles are 48px; shrink the font for 2–3 char marks so they fit. */
export function markFontSize(mark: string): number {
  if (mark.length >= 3) return 13;
  if (mark.length === 2) return 17;
  return 24;
}

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  {
    key: 'gps',
    title: 'GPS & telematics',
    blurb:
      'See every car on the Live Map from the GPS trackers you already run — next to, or instead of, your drivers’ phones. No rip-and-replace.',
    items: [
      {
        name: 'Wialon',
        mark: 'W',
        bg: '#f26722',
        fg: '#ffffff',
        desc: 'Live positions, speed and mileage from your Wialon Hosting or Wialon Local units.',
        status: 'live',
        href: '/fleet/gps?provider=wialon',
      },
      {
        name: 'Traccar',
        mark: 'T',
        bg: '#2f6fed',
        fg: '#ffffff',
        desc: 'Live vehicle locations, ignition and odometer from your Traccar server.',
        status: 'live',
        href: '/fleet/gps?provider=traccar',
      },
      {
        name: 'flespi',
        mark: 'f',
        bg: '#12b886',
        fg: '#ffffff',
        desc: 'Telematics from almost any tracker, streamed through your flespi account.',
        status: 'live',
        href: '/fleet/gps?provider=flespi',
      },
      {
        name: 'Teltonika Trackers',
        mark: 'Tt',
        bg: '#4c9c2e',
        fg: '#ffffff',
        desc: 'Teltonika FMB/FMC trackers — through flespi, Traccar or Wialon.',
        status: 'live',
        href: '/fleet/gps',
        more: '/features/live-tracking',
      },
      {
        name: 'Navixy',
        mark: 'N',
        bg: '#1e88e5',
        fg: '#ffffff',
        desc: 'Live trackers from Navixy and the GPS brands built on it.',
        status: 'live',
        href: '/fleet/gps?provider=navixy',
      },
      {
        name: 'Samsara',
        mark: 'S',
        bg: '#0b2a4a',
        fg: '#ffffff',
        desc: 'Vehicle gateways: position, speed, engine state and odometer.',
        status: 'live',
        href: '/fleet/gps?provider=samsara',
      },
      {
        name: 'Geotab',
        mark: 'G',
        bg: '#25477b',
        fg: '#ffffff',
        desc: 'MyGeotab GO devices on the Rovora Live Map.',
        status: 'live',
        href: '/fleet/gps?provider=geotab',
      },
      {
        name: 'Mapon',
        mark: 'M',
        bg: '#e53935',
        fg: '#ffffff',
        desc: 'Live positions and ignition from your Mapon units.',
        status: 'live',
        href: '/fleet/gps?provider=mapon',
      },
    ],
  },
  {
    key: 'ride-hail',
    title: 'Ride-hailing platforms',
    blurb:
      'See what your drivers and cars did on the platform, next to the rest of your fleet.',
    items: [
      {
        name: 'Bolt',
        mark: 'b',
        logo: 'bolt',
        bg: '#34d186',
        fg: '#ffffff',
        desc: 'Connect your Bolt fleet account with a Fleet API key: rides, fares, tips and acceptance per driver and per car, refreshed every hour, plus who is online right now.',
        status: 'live',
        href: '/fleet/bolt',
        more: '/features/bolt',
      },
    ],
  },
  {
    key: 'accounting',
    title: 'Accounting',
    blurb:
      'Hand your accountant the fleet’s income and expenses in the layout their software imports.',
    items: [
      {
        name: 'Xero CSV export',
        mark: 'X',
        bg: '#13b5ea',
        fg: '#ffffff',
        desc: 'Export your transactions as a Xero bank-statement CSV, one line per dated transaction. A file you import, not a live sync.',
        status: 'live',
        href: '/fleet/financials',
        more: '/features/bookkeeping',
      },
      {
        name: 'QuickBooks CSV export',
        mark: 'qb',
        bg: '#2ca01c',
        fg: '#ffffff',
        desc: 'Export the same transactions as a QuickBooks bank CSV with credit and debit columns. A file you import, not a live sync.',
        status: 'live',
        href: '/fleet/financials',
        more: '/features/bookkeeping',
      },
      {
        name: 'CSV download',
        mark: 'CSV',
        bg: '#64748b',
        fg: '#ffffff',
        desc: 'Download any view of the bookkeeping ledger as a CSV, for a spreadsheet or any other accounting tool.',
        status: 'live',
        href: '/fleet/earnings',
        more: '/features/bookkeeping',
      },
    ],
  },
  {
    key: 'developers',
    title: 'Developers',
    blurb: 'Connect your own tools to your fleet’s data.',
    items: [
      {
        name: 'Rovora API',
        mark: 'API',
        bg: '#0f172a',
        fg: '#ffffff',
        desc: 'A REST API for drivers, vehicles and bookkeeping transactions, with scoped keys and an OpenAPI spec. On plans that include API access.',
        status: 'live',
        href: '/fleet/api',
        more: '/docs/api',
      },
    ],
  },
  {
    key: 'accounts',
    title: 'Sign-in & notifications',
    blurb: 'The everyday services Rovora already works with.',
    items: [
      {
        name: 'Google sign-in',
        mark: 'G',
        bg: '#4285f4',
        fg: '#ffffff',
        desc: 'Sign in and sign up with your Google account instead of another password.',
        status: 'live',
      },
      {
        name: 'Email notifications',
        mark: '@',
        bg: '#5b6ee1',
        fg: '#ffffff',
        desc: 'Published rosters, expiring documents, services due and shift checks sent by email to the people who need them.',
        status: 'live',
        href: '/fleet/notifications',
      },
    ],
  },
];

/** Flat count of everything in the marketplace (used for hero copy). */
export const INTEGRATION_COUNT = INTEGRATION_CATEGORIES.reduce(
  (n, c) => n + c.items.length,
  0,
);
