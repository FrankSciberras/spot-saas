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
 * This is the ONE place planned work is listed: /integrations shows live
 * connections only. List things that are actually being built or that we
 * have committed to (the /ai page, the modules catalog). No dates — we say
 * what is coming, not when.
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
    id: 'rovora-gps',
    status: 'in-progress',
    area: 'Live tracking',
    title: 'Rovora GPS: plug-in trackers without a separate provider',
    text: 'Add a Teltonika tracker by its IMEI and it reports straight to Rovora, billed per tracker on your Rovora invoice. For fleets that want a device in the car but no second GPS subscription to manage.',
    note: 'Rolling out',
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
  },
  {
    id: 'accounting-sync',
    status: 'later',
    area: 'Integrations',
    title: 'Direct Xero & QuickBooks sync',
    text: 'Settlements and expenses pushed straight into your accounting software, instead of downloading a CSV.',
  },
  {
    id: 'stripe-payouts',
    status: 'later',
    area: 'Integrations',
    title: 'One-click driver payouts',
    text: 'Pay drivers what their settlement says through Stripe, reconciled automatically.',
  },
  {
    id: 'whatsapp',
    status: 'later',
    area: 'Integrations',
    title: 'WhatsApp reminders',
    text: 'Shift reminders and alerts sent to drivers on WhatsApp.',
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
