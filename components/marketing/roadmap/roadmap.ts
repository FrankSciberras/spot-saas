/**
 * Rovora roadmap — single source of truth for the /roadmap page.
 *
 * The "Shipped" half of the page is built from the changelog
 * (components/marketing/changelog/releases.ts), so it never needs editing
 * here. This file only holds what is NOT live yet:
 *
 *   in-progress — being built right now (open PR / branch, or private beta)
 *   next        — committed and starting soon; already promised on the site
 *   later       — on the list, no date yet
 *
 * Keeping it current (do this with every moderately sized update):
 *   1. When something ships, add it to RELEASES in releases.ts and DELETE its
 *      entry here — the page then shows it under "Shipped" on its own.
 *   2. When work starts on something, move it to 'in-progress'.
 *   3. Bump ROADMAP_UPDATED.
 *
 * Only list things the rest of the site already promises (the /ai page, the
 * integrations catalog, the modules catalog) or that are actually being
 * built. No dates — we say what is coming, not when.
 */

export type RoadmapStatus = 'in-progress' | 'next' | 'later';

export interface RoadmapItem {
  /** Stable anchor id. */
  id: string;
  status: RoadmapStatus;
  /** Product area, matching the changelog's area labels where possible. */
  area: string;
  title: string;
  /** One or two plain-English sentences on what it does for a fleet. */
  text: string;
  /** Optional page that says more about it. */
  href?: string;
  /** Short note shown as a pill, e.g. 'Private beta'. */
  note?: string;
}

/** ISO date this file was last reviewed. */
export const ROADMAP_UPDATED = '2026-11-18';

export const ROADMAP: RoadmapItem[] = [
  // ── In progress ──────────────────────────────────────────────────────────
  {
    id: 'settings',
    status: 'in-progress',
    area: 'Settings',
    title: 'Settings, reorganised',
    text: 'One settings page with a tab for each part of Rovora, and new options: how early to warn about expiring documents, when a service counts as due, which start- and end-of-shift checks and photos are required, and your fleet’s currency and number format.',
    note: 'In review',
  },
  {
    id: 'preferences',
    status: 'in-progress',
    area: 'Settings',
    title: 'Personal preferences that follow you',
    text: 'Your theme and how you get alerts are saved to your account, not the browser, so they are the same on your laptop and your phone.',
    note: 'In review',
  },
  {
    id: 'ai-assistant',
    status: 'in-progress',
    area: 'Rovora AI',
    title: 'Ask your fleet anything',
    text: '“Which car cost me the most last month?” “Whose documents expire this month?” Ask in plain English from any page and get the answer from your own fleet’s data, linked to the records behind it. Read-only — it never changes anything.',
    href: '/ai',
    note: 'Private beta',
  },

  // ── Next ─────────────────────────────────────────────────────────────────
  {
    id: 'driver-push',
    status: 'next',
    area: 'Driver app',
    title: 'Push notifications on drivers’ phones',
    text: 'Messages, shift reminders and “you’re on shift, location is off” alerts delivered as real push notifications, even when the app has not been opened for a while.',
  },
  {
    id: 'uber',
    status: 'next',
    area: 'Integrations',
    title: 'Uber integration',
    text: 'Trips and weekly earnings imported automatically, the way Bolt works today. Fleet-plan customers are first in line.',
    href: '/integrations',
  },
  {
    id: 'bolt-settlements',
    status: 'next',
    area: 'Bolt',
    title: 'Bolt earnings straight into settlements',
    text: 'Fill in each driver’s weekly settlement from Bolt automatically, as soon as Bolt makes commission and payout figures available through its API.',
  },
  {
    id: 'ai-receipts',
    status: 'next',
    area: 'Rovora AI',
    title: 'Snap a receipt, Rovora fills it in',
    text: 'Photograph a fuel receipt or drop in a garage invoice and Rovora AI reads the vendor, vehicle, line items and VAT, then files it in bookkeeping and the vehicle’s history.',
    href: '/ai',
  },
  {
    id: 'ai-statements',
    status: 'next',
    area: 'Rovora AI',
    title: 'Platform statements, imported for you',
    text: 'Drop in a weekly Uber or Bolt statement (PDF or CSV) and every line is matched to the right driver and lands in that week’s settlement.',
    href: '/ai',
  },
  {
    id: 'ios',
    status: 'next',
    area: 'Driver app',
    title: 'Rovora Driver for iPhone',
    text: 'The driver app on the App Store, alongside the Android app on Google Play.',
  },

  // ── Later ────────────────────────────────────────────────────────────────
  {
    id: 'freenow',
    status: 'later',
    area: 'Integrations',
    title: 'FreeNow integration',
    text: 'Trip data pulled in across your whole fleet.',
    href: '/integrations',
  },
  {
    id: 'accounting-sync',
    status: 'later',
    area: 'Integrations',
    title: 'Direct Xero & QuickBooks sync',
    text: 'Settlements and expenses pushed straight into your accounting software, instead of downloading a CSV.',
    href: '/integrations',
  },
  {
    id: 'stripe-payouts',
    status: 'later',
    area: 'Integrations',
    title: 'One-click driver payouts',
    text: 'Pay drivers what their settlement says through Stripe, reconciled automatically.',
    href: '/integrations',
  },
  {
    id: 'gps-hardware',
    status: 'later',
    area: 'Live tracking',
    title: 'GPS hardware trackers',
    text: 'Live positions and trips from Wialon, Traccar, flespi and Teltonika trackers, for fleets that already have hardware fitted.',
    href: '/integrations',
  },
  {
    id: 'whatsapp',
    status: 'later',
    area: 'Integrations',
    title: 'WhatsApp reminders',
    text: 'Shift reminders and alerts sent to drivers on WhatsApp.',
    href: '/integrations',
  },
  {
    id: 'invoices',
    status: 'later',
    area: 'Invoices',
    title: 'Invoices for customers and partners',
    text: 'Create, send and track invoices for corporate accounts and partners.',
  },
  {
    id: 'ai-quotes',
    status: 'later',
    area: 'Rovora AI',
    title: 'A second opinion on every repair',
    text: 'Repair quotes checked against your own history, with unusually high prices and too-soon repeat work flagged before you pay.',
    href: '/ai',
  },
];
