// Single source of truth for the integrations marketplace, shared by the public
// marketing page (/integrations) and the fleet dashboard (/fleet/integrations).
// Every entry is presented as a coloured logo tile + a "Coming soon" badge — we
// don't ship the real third-party marks (trademarks), so the tile uses a short
// mark and brand-ish colours instead.

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
      {
        name: 'Webfleet',
        mark: 'Wf',
        bg: '#e30613',
        fg: '#ffffff',
        desc: 'Bridgestone Webfleet vehicles — waiting on Webfleet partner approval.',
        status: 'coming-soon',
      },
    ],
  },
  {
    key: 'ride-hail',
    title: 'Ride-hail platforms',
    blurb:
      'Auto-import trips and payouts from the platforms your drivers already work on — no more manual copying.',
    items: [
      {
        name: 'Uber',
        mark: 'U',
        bg: '#000000',
        fg: '#ffffff',
        desc: 'Auto-import trips and weekly earnings.',
        status: 'coming-soon',
      },
      {
        name: 'Bolt',
        mark: 'b',
        logo: 'bolt',
        bg: '#34d186',
        fg: '#ffffff',
        desc: 'Rides, fares, tips and acceptance rates per driver, plus who is online right now.',
        status: 'live',
        href: '/fleet/bolt',
      },
      {
        name: 'FreeNow',
        mark: 'F',
        bg: '#00b9b0',
        fg: '#04211f',
        desc: 'Pull trip data across your whole fleet.',
        status: 'coming-soon',
      },
    ],
  },
  {
    key: 'communication',
    title: 'Communication',
    blurb:
      'Reach drivers where they already are and keep everyone in the loop automatically.',
    items: [
      {
        name: 'WhatsApp',
        mark: 'WA',
        bg: '#25d366',
        fg: '#06341c',
        desc: 'Send shift reminders and alerts to drivers on WhatsApp.',
        status: 'coming-soon',
      },
      {
        name: 'Email',
        mark: '@',
        bg: '#5b6ee1',
        fg: '#ffffff',
        desc: 'Automated email updates for drivers, staff and accountants.',
        status: 'coming-soon',
      },
    ],
  },
  {
    key: 'accounting',
    title: 'Accounting & payments',
    blurb:
      'Send settlements, expenses and payouts straight to your books — and out to your drivers.',
    items: [
      {
        name: 'Xero',
        mark: 'X',
        bg: '#13b5ea',
        fg: '#ffffff',
        desc: 'Push settlements and expenses to your Xero ledger.',
        status: 'coming-soon',
      },
      {
        name: 'QuickBooks',
        mark: 'qb',
        bg: '#2ca01c',
        fg: '#ffffff',
        desc: 'Sync payouts and costs into QuickBooks Online.',
        status: 'coming-soon',
      },
      {
        name: 'Stripe',
        mark: 'S',
        bg: '#635bff',
        fg: '#ffffff',
        desc: 'Pay drivers out in one click, fully reconciled.',
        status: 'coming-soon',
      },
      {
        name: 'CSV export for accountants',
        mark: 'CSV',
        bg: '#64748b',
        fg: '#ffffff',
        desc: 'One-click QuickBooks & Xero-ready CSV of your income, expenses and driver pay.',
        status: 'live',
        href: '/fleet/financials',
      },
    ],
  },
];

/** Flat count of everything in the marketplace (used for hero copy). */
export const INTEGRATION_COUNT = INTEGRATION_CATEGORIES.reduce(
  (n, c) => n + c.items.length,
  0,
);
