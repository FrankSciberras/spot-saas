/**
 * Rovora changelog — single source of truth for the /changelog page.
 *
 * Written for fleet operators, not developers: each entry translates what we
 * shipped into plain English. Newest release first. To announce something new,
 * add a Release at the top of RELEASES and it appears on the page automatically.
 */

export type ChangeTag = 'new' | 'improved' | 'fixed' | 'security';

export interface ChangeItem {
  /** What kind of change this is — drives the coloured chip. */
  tag: ChangeTag;
  /** Area of the product, e.g. 'Live tracking', 'Settlements'. */
  area: string;
  /** One-line, plain-English description of the change. */
  text: string;
}

export interface Release {
  /** Stable anchor id, e.g. '2026-07'. */
  id: string;
  /** ISO date of the release (used for ordering & <time>). */
  date: string;
  /** Human date shown on the page, e.g. 'July 2026'. */
  dateHuman: string;
  /** Headline theme for the release. */
  title: string;
  /** One or two sentences introducing the release. */
  summary: string;
  /** Marks the newest / featured release. */
  highlight?: boolean;
  items: ChangeItem[];
}

export const RELEASES: Release[] = [
  {
    id: '2026-07',
    date: '2026-07-09',
    dateHuman: 'July 2026',
    title: 'A modular fleet, integrations & smarter driver pay',
    summary:
      'Rovora becomes modular — switch features on and off for each fleet — plus a brand-new integrations marketplace and a much smarter way to set up driver pay.',
    highlight: true,
    items: [
      {
        tag: 'new',
        area: 'Apps & modules',
        text: 'Turn features on or off for each fleet — settlements, bookkeeping, rostering, tracking, maintenance, reminders and parts. Your dashboard only shows what you actually use.',
      },
      {
        tag: 'new',
        area: 'Integrations',
        text: 'A new integrations marketplace to connect GPS trackers, ride-hail platforms, WhatsApp and email. Accountant-ready exports for Xero & QuickBooks are live today.',
      },
      {
        tag: 'new',
        area: 'Driver pay',
        text: 'Pay models let you set hourly or fixed wages and pick exactly which extras (splits, tips, campaigns, rent) apply to each driver — with a guided pay interview that builds it all for you.',
      },
      {
        tag: 'new',
        area: 'Parts & inventory',
        text: 'Track parts and stock alongside maintenance, so you know what a repair really costs.',
      },
      {
        tag: 'improved',
        area: 'Onboarding',
        text: 'A getting-started checklist and first-visit prompts walk new fleets through setup step by step.',
      },
      {
        tag: 'security',
        area: 'Platform',
        text: 'Closed a cross-fleet data-visibility gap on reminders, tightened billing and roster permissions, and fixed an open-redirect.',
      },
    ],
  },
  {
    id: '2026-07-early',
    date: '2026-07-04',
    dateHuman: 'Early July 2026',
    title: 'We’re now Rovora — live on Google Play',
    summary:
      'Spot became Rovora, we launched at rovora.eu, and the free driver app landed on Google Play.',
    items: [
      {
        tag: 'improved',
        area: 'Brand',
        text: 'Spot is now Rovora — new name, new logo and a home at rovora.eu.',
      },
      {
        tag: 'new',
        area: 'Driver app',
        text: 'The free Rovora Driver app is live on Google Play, with a download badge across the site.',
      },
      {
        tag: 'new',
        area: 'Blog',
        text: 'Launched the fleet operator’s blog with five in-depth, no-fluff guides.',
      },
      {
        tag: 'improved',
        area: 'Platform',
        text: 'Automated reminders switched back on now we’re live, plus site-wide search-engine metadata and social cards.',
      },
      {
        tag: 'security',
        area: 'Platform',
        text: 'Tenant-isolation hardening so every fleet’s data stays firmly its own.',
      },
    ],
  },
  {
    id: '2026-06',
    date: '2026-06-11',
    dateHuman: 'June 2026',
    title: 'Live driver tracking — no hardware needed',
    summary:
      'Our biggest release yet: see your whole fleet on a live map using just the driver’s phone — no GPS boxes to fit or wire in.',
    items: [
      {
        tag: 'new',
        area: 'Live tracking',
        text: 'Watch every on-shift driver move on a live fleet map, straight from the free driver app — no hardware to install.',
      },
      {
        tag: 'new',
        area: 'Live tracking',
        text: 'Route playback, trip distances, speeding alerts and lost-signal alerts.',
      },
      {
        tag: 'new',
        area: 'Live tracking',
        text: 'Geofence zones that alert you the moment a vehicle enters or leaves an area.',
      },
      {
        tag: 'new',
        area: 'Driver app',
        text: 'A brand-new Rovora Driver app (Android) with reliable background location and built-in crash reporting.',
      },
      {
        tag: 'new',
        area: 'Settlements',
        text: 'A guided settlements setup wizard builds your platforms, pay preset and weekly charges from a few simple questions.',
      },
      {
        tag: 'improved',
        area: 'Pricing',
        text: 'New per-vehicle pricing with an interactive calculator, so you see your exact monthly cost before you sign up.',
      },
      {
        tag: 'improved',
        area: 'Support',
        text: 'Added an AI support chat to the site that answers fleet and pricing questions instantly.',
      },
    ],
  },
  {
    id: '2026-05',
    date: '2026-05-08',
    dateHuman: 'May 2026',
    title: 'Invoicing & a cleaner platform',
    summary: 'Invoicing arrives, and the admin area gets a tidy-up and a clearer name.',
    items: [
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Create and manage invoices for your fleet, packaged up alongside your financials.',
      },
      {
        tag: 'improved',
        area: 'Platform',
        text: 'Renamed the admin area to “Fleet” and streamlined setup for new operators.',
      },
    ],
  },
  {
    id: '2026-04',
    date: '2026-04-08',
    dateHuman: 'April 2026',
    title: 'Office staff, permissions & an audit log',
    summary:
      'Bring your office team into Rovora with exactly the right access — and keep a full record of who did what.',
    items: [
      {
        tag: 'new',
        area: 'Staff',
        text: 'Add office staff with fine-grained permissions controlling what each person can see and do.',
      },
      {
        tag: 'new',
        area: 'Platform',
        text: 'An audit log records key actions across your fleet, so nothing happens without a trail.',
      },
      {
        tag: 'improved',
        area: 'Reminders',
        text: 'More reliable document, service and shift reminders, with tighter access rules behind them.',
      },
    ],
  },
  {
    id: '2026-03',
    date: '2026-03-25',
    dateHuman: 'March 2026',
    title: 'Vehicle damage, mapped visually',
    summary:
      'Log damage right on a diagram of the car, and keep reminders running quietly in the background.',
    items: [
      {
        tag: 'new',
        area: 'Damage',
        text: 'Mark damage directly on a car diagram with a built-in drawing editor — no more vague notes.',
      },
      {
        tag: 'new',
        area: 'Adjustments',
        text: 'A new adjustments card makes one-off charges and credits quick to add to a settlement.',
      },
      {
        tag: 'improved',
        area: 'Reminders',
        text: 'Scheduled background jobs keep document, service and shift reminders firing automatically.',
      },
      {
        tag: 'improved',
        area: 'Driver app',
        text: 'Push-notification reminders and a polished tablet layout for the driver app.',
      },
    ],
  },
  {
    id: '2026-02',
    date: '2026-02-09',
    dateHuman: 'February 2026',
    title: 'Damage reports & clearer financials',
    summary:
      'Track vehicle damage with photos and permissions, and get a cleaner view of the money.',
    items: [
      {
        tag: 'new',
        area: 'Damage',
        text: 'A dedicated damage page with photo uploads and per-role permissions.',
      },
      {
        tag: 'improved',
        area: 'Financials',
        text: 'Refreshed financial dashboards, plus tidier drivers and vehicles pages.',
      },
      {
        tag: 'improved',
        area: 'Platform',
        text: 'Added crash reporting so we spot and fix problems faster than you can report them.',
      },
    ],
  },
  {
    id: '2026-01',
    date: '2026-01-21',
    dateHuman: 'January 2026',
    title: 'Settlements, earnings & dark mode',
    summary:
      'A big month for money: weekly settlements, driver earnings, bookkeeping and analytics — plus a dark mode for the late shifts.',
    items: [
      {
        tag: 'new',
        area: 'Settlements',
        text: 'Weekly driver settlements with financial graphs and analytics.',
      },
      {
        tag: 'new',
        area: 'Driver pay',
        text: 'Drivers get their own earnings and financials view on their phone.',
      },
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Earnings and adjustments now feed straight into bookkeeping.',
      },
      {
        tag: 'new',
        area: 'Settlements',
        text: 'Export settlements for your own records in a couple of clicks.',
      },
      {
        tag: 'improved',
        area: 'Design',
        text: 'Light and dark mode across the whole dashboard.',
      },
      {
        tag: 'fixed',
        area: 'Notifications',
        text: 'Dynamic, timezone-aware emails and a batch of notification fixes.',
      },
    ],
  },
  {
    id: '2025-12',
    date: '2025-12-03',
    dateHuman: 'December 2025',
    title: 'Rovora launches',
    summary:
      'The very first release — everything a fleet needs on day one: rosters, shifts, driver settlements and an app you can install on your phone.',
    items: [
      {
        tag: 'new',
        area: 'Platform',
        text: 'Rovora launches with drivers, vehicles, rosters and settlement balances in one place.',
      },
      {
        tag: 'new',
        area: 'Rosters',
        text: 'Build shift rosters and let drivers go on-shift straight from their phone.',
      },
      {
        tag: 'new',
        area: 'Driver app',
        text: 'An installable app (PWA) with push notifications — add Rovora to your home screen.',
      },
      {
        tag: 'new',
        area: 'Vehicles',
        text: 'Assign multiple vehicles to a driver and track service mileage as they drive.',
      },
      {
        tag: 'new',
        area: 'Staff',
        text: 'Staff profiles, employment types and secure password reset from the start.',
      },
    ],
  },
];

/** Human label for the most recent release date — handy for the hero meta. */
export const LATEST_UPDATED = RELEASES[0]?.dateHuman ?? '';

/** Total number of published releases. */
export const RELEASE_COUNT = RELEASES.length;
