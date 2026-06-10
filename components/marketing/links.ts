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
  { slug: 'settlements', label: 'Weekly settlements', blurb: 'Reconcile every driver’s week into one payable number.' },
  { slug: 'flexible-pay', label: 'Flexible pay', blurb: 'Per-driver splits for fares, tips, campaigns and fees.' },
  { slug: 'adjustments', label: 'Adjustments', blurb: 'Bonuses, expenses and deductions, applied automatically.' },
  { slug: 'live-tracking', label: 'Live driver tracking', blurb: 'See who’s on shift, hours and earnings as they happen.' },
  { slug: 'rosters', label: 'Rosters & shifts', blurb: 'Plan the week and publish shifts in a click.' },
  { slug: 'maintenance', label: 'Maintenance & services', blurb: 'Mileage-triggered servicing with automatic alerts.' },
];

export const featureHref = (slug: string) => `/features/${slug}`;
