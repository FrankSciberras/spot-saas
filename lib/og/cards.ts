// =============================================================================
// Social share cards — what a link to rovora.eu looks like when it is pasted
// into WhatsApp, LinkedIn, Facebook, X, Slack, iMessage or Google Discover.
//
// One card per public page, drawn at build time by app/og/[...slug]/route.tsx
// in the site's current look (light, green accent, a real product screenshot).
// The headline is the page's own hero line, so the preview matches what the
// visitor lands on. Unknown paths fall back to the home card.
//
// Only pages listed here and real blog posts get an image (the route 404s
// anything else — see lib/og/registry.ts), so the card can't be used to print
// arbitrary text under the Rovora logo.
//
// This file imports nothing from the site on purpose: lib/seo.ts uses it, and
// the blog catalogue imports lib/seo.ts, so pulling the blog in here would
// make a loop. Blog cards are added in lib/og/registry.ts.
// =============================================================================

/** Screenshots in public/home/, shown on the right of the card. */
export type OgShot = 'dashboard' | 'vehicles' | 'vehicle-record' | 'live-map' | 'earnings' | 'expiring-soon';

export interface OgCard {
  /** Small green label above the headline. */
  eyebrow: string;
  /** The headline. */
  title: string;
  /** Words of the title shown in green (must appear in `title`). */
  accent?: string;
  /** One supporting line under the headline. */
  sub: string;
  /** Product screenshot on the right; none = a text card with the R mark. */
  shot?: OgShot;
}

const HOME: OgCard = {
  eyebrow: 'Fleet management software',
  title: 'Run your whole fleet from one screen.',
  accent: 'one screen.',
  sub: 'Vehicles, drivers, rosters, driver pay and live tracking for taxi & rideshare fleets.',
  shot: 'dashboard',
};

const PAGES: Record<string, OgCard> = {
  '/': HOME,
  '/pricing': {
    eyebrow: 'Pricing',
    title: 'Simple pricing that grows with your fleet.',
    accent: 'grows with your fleet.',
    sub: 'Flat monthly plans per fleet. Get started free — no card required.',
    shot: 'dashboard',
  },

  // ── Features ──
  '/features/vehicles': { eyebrow: 'Vehicle management', title: 'Every vehicle you run, managed in one record.', accent: 'managed in one record.', sub: 'Documents, insurance, mileage, costs and history for every car.', shot: 'vehicles' },
  '/features/maintenance': { eyebrow: 'Vehicle care', title: 'Vehicle maintenance tracking that never forgets.', accent: 'never forgets.', sub: 'Services by mileage and date, with reminders before anything is due.', shot: 'vehicle-record' },
  '/features/damage': { eyebrow: 'Damage & repairs', title: 'Vehicle damage reports, backed by photo proof.', accent: 'backed by photo proof.', sub: 'Photos, zones, repair costs and pre-shift checks in one place.', shot: 'vehicle-record' },
  '/features/live-tracking': { eyebrow: 'Live operations', title: 'Live fleet tracking, without the GPS hardware.', accent: 'without the GPS hardware.', sub: 'See every driver on the map from the phone they already carry.', shot: 'live-map' },
  '/features/safety': { eyebrow: 'Driver safety', title: 'See how your cars are driven, event by event.', accent: 'event by event.', sub: 'Harsh braking, speeding and cornering on the map, with a safety score per driver.', shot: 'live-map' },
  '/features/rosters': { eyebrow: 'Scheduling', title: 'Driver scheduling for the week, published in a click.', accent: 'published in a click.', sub: 'Shift rosters your drivers see on their phone the moment you publish.', shot: 'dashboard' },
  '/features/settlements': { eyebrow: 'Driver settlements', title: 'Driver settlements, reconciled and paid in minutes.', accent: 'paid in minutes.', sub: 'Uber, Bolt and cash earnings turned into a clear weekly payout.', shot: 'earnings' },
  '/features/flexible-pay': { eyebrow: 'Flexible pay', title: 'Driver pay for the deals you actually run.', accent: 'you actually run.', sub: 'Fare splits, tips, campaigns, rent and wages — set once per driver.', shot: 'earnings' },
  '/features/adjustments': { eyebrow: 'Adjustments', title: 'Driver bonuses and deductions, without the maths.', accent: 'without the maths.', sub: 'Fines, fuel, advances and bonuses flow straight into the settlement.', shot: 'earnings' },
  '/features/bookkeeping': { eyebrow: 'Bookkeeping', title: 'Know what the fleet made this week, not next quarter.', accent: 'this week,', sub: 'Income, costs and receipts in one ledger, ready for your accountant.', shot: 'earnings' },
  '/features/bolt': { eyebrow: 'Bolt integration', title: 'Your Bolt fleet, next to everything else you run.', accent: 'next to everything else', sub: 'Rides, fares and drivers synced from Bolt every hour.', shot: 'dashboard' },
  '/features/messages': { eyebrow: 'Driver messaging', title: 'Talk to your drivers without the WhatsApp group.', accent: 'without the WhatsApp group.', sub: 'Direct messages, groups and announcements inside Rovora.', shot: 'dashboard' },
  '/features/driver-app': { eyebrow: 'Rovora Driver app', title: 'The driver’s side of the fleet, on the phone they already have.', accent: 'on the phone they already have.', sub: 'Shifts, rosters, pay and vehicle checks — free for every driver.' },

  // ── Who it's for ──
  '/for/bolt-uber-fleets': { eyebrow: 'For Bolt, Uber & eCabs fleets', title: 'Fleet software for ride-hailing fleets.', accent: 'ride-hailing fleets.', sub: 'From Monday’s roster to Monday’s payout, in one place.', shot: 'earnings' },
  '/for/small-fleets': { eyebrow: 'For fleets of 2 to 10 cars', title: 'You run the fleet. Rovora takes the paperwork.', accent: 'takes the paperwork.', sub: 'Settlements, reminders and records without the spreadsheets.', shot: 'vehicles' },
  '/for/growing-fleets': { eyebrow: 'For fleets of 10 to 75 cars', title: 'When the fleet outgrows the owner’s phone.', accent: 'outgrows the owner’s phone.', sub: 'Give the office one system for cars, drivers and pay.', shot: 'dashboard' },

  // ── Product & company ──
  '/integrations': { eyebrow: 'Integrations', title: 'Connects to the tools you already run.', accent: 'you already run.', sub: 'Bolt, GPS trackers, accounting exports and a public API.' },
  '/docs/api': { eyebrow: 'Developers', title: 'The Rovora fleet management API.', accent: 'API.', sub: 'Drivers, vehicles and financials over REST, with scoped keys.' },
  '/ai': { eyebrow: 'Rovora AI', title: 'AI fleet management that does the paperwork.', accent: 'does the paperwork.', sub: 'Ask about your fleet in plain English and get answers from your own data.', shot: 'dashboard' },
  '/about': { eyebrow: 'About Rovora', title: 'Fleet software built for small taxi fleets.', accent: 'small taxi fleets.', sub: 'Made in Malta, hosted in the EU, built with the fleets that use it.' },
  '/contact': { eyebrow: 'Contact', title: 'Talk to the team behind your fleet software.', accent: 'your fleet software.', sub: 'Sales questions, demos and support — a real person replies.' },
  '/security': { eyebrow: 'Security & GDPR', title: 'Your fleet data, hosted in the EU.', accent: 'hosted in the EU.', sub: 'Encryption, strict access rules and GDPR-ready driver data.' },
  '/careers': { eyebrow: 'Careers', title: 'Help small fleets run smoothly.', accent: 'run smoothly.', sub: 'Join a small, product-led team building Rovora.' },
  '/changelog': { eyebrow: 'Changelog', title: 'What’s new in Rovora.', accent: 'new', sub: 'Every feature and fix we ship, as it ships.' },
  '/roadmap': { eyebrow: 'Roadmap', title: 'What we’ve shipped and what’s next.', accent: 'what’s next.', sub: 'The plan for Rovora, in the open.' },
  '/blog': { eyebrow: 'Rovora blog', title: 'Guides for running a taxi fleet.', accent: 'taxi fleet.', sub: 'Maintenance, driver pay, tracking and growing a fleet — in plain English.' },
  '/privacy': { eyebrow: 'Privacy policy', title: 'How Rovora handles your data.', accent: 'your data.', sub: 'GDPR, driver data and website analytics, explained plainly.' },
  '/terms': { eyebrow: 'Terms of service', title: 'Rovora terms of service.', accent: 'terms', sub: 'Subscriptions, acceptable use and your rights.' },
};

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The fixed (non-blog) cards, keyed by page path. */
export function pageCard(path: string): OgCard | null {
  return PAGES[path] ?? null;
}
export const PAGE_CARD_PATHS = Object.keys(PAGES);

/** /og/home.png, /og/features/vehicles.png, /og/blog/<slug>.png */
export function ogImagePath(path: string): string {
  if (path !== '/' && (PAGES[path] || /^\/blog\/[a-z0-9-]+$/.test(path))) return `/og${path}.png`;
  return '/og/home.png';
}

/**
 * Open Graph / X image entry for a page's metadata. `title` (the page's own
 * title) is used for the alt text when the page has no fixed card (blog posts).
 */
export function ogImageFor(path: string, title?: string) {
  const own = PAGES[path]?.title ?? title ?? HOME.title;
  return {
    url: ogImagePath(path),
    width: OG_SIZE.width,
    height: OG_SIZE.height,
    alt: `${own.replace(/\.$/, '').replace(/ — Rovora( Blog)?$/, '')} — Rovora`,
    type: 'image/png',
  };
}
