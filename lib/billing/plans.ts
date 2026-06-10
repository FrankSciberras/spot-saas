// =============================================================================
// BILLING — PLANS, LIMITS & FLEET BILLING STATUS (client-safe)
// =============================================================================
// A fleet starts on a 30-day no-card `trial` with full access. When the trial
// ends it must move onto a paid plan; the required tier is driven by usage —
// BOTH drivers and vehicles are checked and the higher count wins.
//
// The plan CATALOGUE is now DB-backed and edited by the platform admin (see the
// `plans` table + lib/actions/plans.ts). This module stays CLIENT-SAFE: it holds
// only types, pure catalogue helpers (which take the loaded PlanDef[] as an
// argument) and a hardcoded FALLBACK_PLANS used if the DB read ever fails. The
// server-only DB loader lives in ./plans-data; the status resolver in
// ./fleet-billing.
//
// `trial` is a built-in STATE, not a sellable package, so it never appears in
// the catalogue — only as the `Plan` value 'trial'.
// =============================================================================

/** Any plan key. 'trial' is the built-in free state; everything else is a
 *  package `key` from the `plans` table (e.g. 'starter', 'growth', custom). */
export type Plan = string;
/** A paid package key — any catalogue key (i.e. not 'trial'). */
export type PaidPlan = string;

export const TRIAL_PLAN = 'trial';

export interface PlanDef {
  /** Catalogue key — matches organizations.plan. */
  id: PaidPlan;
  name: string;
  blurb: string | null;
  /** Display price, e.g. '€49', 'Custom'. */
  priceLabel: string;
  /** Display suffix, e.g. '/ mo', '/ vehicle / mo'. null = no suffix. */
  priceUnit: string | null;
  /** Monthly amount per account used for MRR/ARR maths (0 for custom). */
  priceAmount: number;
  /** e.g. 'Up to 10 vehicles · billed monthly'. */
  billingNote: string | null;
  /** Short cap summary, e.g. 'Up to 10 drivers & vehicles'. */
  capLabel: string | null;
  /** Max drivers / vehicles. null = unlimited. */
  maxDrivers: number | null;
  maxVehicles: number | null;
  features: string[];
  /** Accent colour token or hex. */
  color: string | null;
  /** Marketing CTA button text. */
  ctaLabel: string | null;
  /** Marketing CTA target. null = self-serve trial signup. */
  ctaHref: string | null;
  /** Custom-priced (no self-serve activation). */
  isCustom: boolean;
  /** 'Most popular' marketing badge. */
  isPopular: boolean;
  /** Catalogue order — also the limit ranking. */
  sortOrder: number;
  /** Stripe recurring Price id; null when the plan isn't wired to Stripe yet. */
  stripePriceId: string | null;
  /** Stripe Product id; checkout resolves its default price when no explicit price is set. */
  stripeProductId: string | null;
}

export const TRIAL_DAYS = 30;

// Resilience fallback — mirrors the seed in 20260603_dynamic_plans.sql. Used
// only when the DB catalogue can't be loaded so the app still renders + gates.
export const FALLBACK_PLANS: PlanDef[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'For owner-operators getting off spreadsheets.',
    priceLabel: '€49',
    priceUnit: '/ mo',
    priceAmount: 49,
    billingNote: 'Up to 10 vehicles · billed monthly',
    capLabel: 'Up to 10 drivers & vehicles',
    maxDrivers: 10,
    maxVehicles: 10,
    features: ['Dashboard, drivers & vehicles', 'Shifts & rosters', 'Free driver app', 'Email support'],
    color: 'var(--text-2)',
    ctaLabel: 'Start free trial',
    ctaHref: null,
    isCustom: false,
    isPopular: false,
    sortOrder: 1,
    stripePriceId: null,
    stripeProductId: null,
  },
  {
    id: 'growth',
    name: 'Growth',
    blurb: 'For growing fleets that pay drivers weekly.',
    priceLabel: '€149',
    priceUnit: '/ mo',
    priceAmount: 149,
    billingNote: 'Up to 50 vehicles · billed monthly',
    capLabel: 'Up to 50 drivers & vehicles',
    maxDrivers: 50,
    maxVehicles: 50,
    features: ['Everything in Starter', 'Financials & settlements', 'Maintenance & damages', 'Priority support'],
    color: 'var(--accent)',
    ctaLabel: 'Start free trial',
    ctaHref: null,
    isCustom: false,
    isPopular: true,
    sortOrder: 2,
    stripePriceId: null,
    stripeProductId: null,
  },
  {
    id: 'scale',
    name: 'Scale',
    blurb: 'For larger operators with custom needs.',
    priceLabel: 'Custom',
    priceUnit: null,
    priceAmount: 0,
    billingNote: '50+ vehicles · annual billing',
    capLabel: 'Unlimited drivers & vehicles',
    maxDrivers: null,
    maxVehicles: null,
    features: ['Everything in Growth', 'Dedicated subdomain', 'Guided onboarding & import', 'SLA & dedicated account manager'],
    color: '#a78bfa',
    ctaLabel: 'Book a demo',
    ctaHref: 'mailto:hello@rovora.eu?subject=Rovora%20Fleet%20demo',
    isCustom: true,
    isPopular: false,
    sortOrder: 3,
    stripePriceId: null,
    stripeProductId: null,
  },
];

// ── Pure catalogue helpers (operate on the loaded PlanDef[]) ────────────────

/** Catalogue sorted by ascending capacity (sortOrder). Trial ranks below all. */
function sortedByRank(plans: PlanDef[]): PlanDef[] {
  return [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Ordered ranking so we can compare "is the current plan big enough?".
 * Trial is 0; each package's rank is its 1-based position by sortOrder.
 */
export function planRank(plans: PlanDef[], plan: Plan): number {
  if (plan === TRIAL_PLAN) return 0;
  const ordered = sortedByRank(plans);
  const idx = ordered.findIndex((p) => p.id === plan);
  return idx === -1 ? 0 : idx + 1;
}

export function getPlanDef(plans: PlanDef[], plan: Plan): PlanDef | undefined {
  return plans.find((p) => p.id === plan);
}

/** True when a plan is wired to Stripe (an explicit price or a product to resolve). */
export function hasStripeTarget(plan: PlanDef): boolean {
  return !!(plan.stripePriceId || plan.stripeProductId);
}

/** True when a plan has room for the given count (null cap = unlimited). */
function fits(cap: number | null, count: number): boolean {
  return cap === null || count <= cap;
}

/**
 * Smallest package (by sortOrder) that can hold the given usage — drivers AND
 * vehicles both matter. Falls back to the largest package if none fit. Returns
 * the last catalogue entry's key if the catalogue is empty-ish.
 */
export function requiredPlanFor(plans: PlanDef[], drivers: number, vehicles: number): PaidPlan {
  const ordered = sortedByRank(plans);
  if (ordered.length === 0) return TRIAL_PLAN;
  const fit = ordered.find((p) => fits(p.maxDrivers, drivers) && fits(p.maxVehicles, vehicles));
  return (fit ?? ordered[ordered.length - 1]).id;
}

export interface FleetBilling {
  plan: Plan;
  status: string; // organizations.status: active | suspended | cancelled
  trialEndsAt: string | null;
  /** Whole days remaining in the trial (0 if past / not on trial). */
  trialDaysLeft: number;
  onTrial: boolean;
  trialExpired: boolean;
  drivers: number;
  vehicles: number;
  /** Smallest paid plan that fits current usage. */
  requiredPlan: PaidPlan;
  /** True when the current paid plan is smaller than usage requires. */
  overLimit: boolean;
  /**
   * True when the fleet dashboard should be blocked behind the upgrade screen:
   *   - trial has expired, or
   *   - on a paid plan but outgrew it, or
   *   - org was suspended/cancelled by a platform admin.
   */
  locked: boolean;
}
