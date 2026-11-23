// Shared marketing CTA targets + the feature-page catalogue used by the nav,
// footer and the /features pages so everything links to one source of truth.

export const SIGN_IN = '/login';
export const START_TRIAL = '/login?mode=signup';

export interface FeatureLink {
  slug: string;
  /** Nav/footer label. */
  label: string;
  /** One-line description for the features menu / index. */
  blurb: string;
}

/** Live feature pages under /features/<slug>. */
export const FEATURES: FeatureLink[] = [
  { slug: 'vehicles', label: 'Vehicle management', blurb: 'Every car’s documents, mileage and drivers in one profile.' },
  { slug: 'maintenance', label: 'Maintenance & services', blurb: 'Mileage-triggered servicing with automatic alerts.' },
  { slug: 'damage', label: 'Damage & repairs', blurb: 'Log damage with photos, track repairs and costs per car.' },
  { slug: 'live-tracking', label: 'Live driver tracking', blurb: 'See who’s on shift, hours and earnings as they happen.' },
  { slug: 'rosters', label: 'Rosters & shifts', blurb: 'Plan the week and publish shifts in a click.' },
  { slug: 'settlements', label: 'Weekly settlements', blurb: 'Reconcile every driver’s week into one payable number.' },
  { slug: 'flexible-pay', label: 'Flexible pay', blurb: 'Per-driver splits for fares, tips, campaigns and fees.' },
  { slug: 'adjustments', label: 'Adjustments', blurb: 'Bonuses, expenses and deductions, applied automatically.' },
  { slug: 'messages', label: 'Driver messaging', blurb: 'Chats, groups and announcements with your drivers, instead of a WhatsApp group.' },
  { slug: 'driver-app', label: 'Driver app', blurb: 'Shifts, checks, rosters, earnings and messages on the driver’s phone.' },
  { slug: 'safety', label: 'Driver safety', blurb: 'Harsh braking, cornering and speeding, scored per driver and shown on a map.' },
  { slug: 'bolt', label: 'Bolt integration', blurb: 'Your Bolt rides, fares and drivers next to the rest of your fleet.' },
  { slug: 'bookkeeping', label: 'Bookkeeping & financials', blurb: 'Record every expense the day it happens; profit by day, week or month.' },
];

export const featureHref = (slug: string) => `/features/${slug}`;

export interface FeatureMenuGroup {
  heading: string;
  items: { slug: string; label: string; blurb: string }[];
}

/** The Features menu (desktop sheet and phone menu): feature pages grouped by job. */
export const FEATURE_MENU: FeatureMenuGroup[] = [
  {
    heading: 'Fleet',
    items: [
      { slug: 'vehicles', label: 'Vehicle management', blurb: 'Every vehicle, document and driver in one record.' },
      { slug: 'maintenance', label: 'Maintenance & services', blurb: 'Service reminders by date or mileage.' },
      { slug: 'damage', label: 'Damage & repairs', blurb: 'Log damage with photos and track repairs.' },
      { slug: 'live-tracking', label: 'Live driver tracking', blurb: 'See drivers and vehicles on one live map.' },
    ],
  },
  {
    heading: 'Drivers',
    items: [
      { slug: 'rosters', label: 'Rosters & shifts', blurb: 'Plan the week and publish it to drivers.' },
      { slug: 'messages', label: 'Driver messaging', blurb: 'Message drivers without the group chats.' },
      { slug: 'safety', label: 'Driver safety', blurb: 'Harsh braking and speeding, scored per driver.' },
      { slug: 'driver-app', label: 'Driver app', blurb: 'Shifts, earnings and statements on their phone.' },
    ],
  },
  {
    heading: 'Money & admin',
    items: [
      { slug: 'settlements', label: 'Weekly settlements', blurb: 'Driver pay worked out every week.' },
      { slug: 'flexible-pay', label: 'Flexible pay', blurb: 'Splits, rents and commission your way.' },
      { slug: 'adjustments', label: 'Adjustments', blurb: 'Fines, fuel and advances, kept fair.' },
      { slug: 'bookkeeping', label: 'Financials & bookkeeping', blurb: 'Income, costs and profit by week.' },
    ],
  },
];

export interface AudienceLink {
  slug: string;
  label: string;
  blurb: string;
}

/** "Who it's for" pages under /for/<slug>. */
export const AUDIENCES: AudienceLink[] = [
  { slug: 'bolt-uber-fleets', label: 'Bolt & Uber fleets', blurb: 'Ride-hailing fleets that pay drivers a share of what they earn each week.' },
  { slug: 'small-fleets', label: 'Small fleets, 2–10 cars', blurb: 'Owners who do the rosters, the pay and the paperwork themselves.' },
  { slug: 'growing-fleets', label: 'Growing fleets, 10–75 cars', blurb: 'Fleets with office staff, where things need to run without the owner.' },
];

export const audienceHref = (slug: string) => `/for/${slug}`;
