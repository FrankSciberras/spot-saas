// =============================================================================
// Shapes returned by the Analytics API routes added for the customer-insights
// tabs — shared by the routes (server) and AnalyticsPage (client). Types only.
//
//   /api/admin/analytics/business  → BusinessData  (accounts, trials, revenue,
//                                     retention — from the database + Stripe)
//   /api/admin/analytics/extras    → ExtrasData    (scroll, speed, missing
//                                     pages, sections seen… — website data)
// =============================================================================

export type CohortUnit = 'day' | 'week' | 'month';

/** One period's business numbers. Money is EUR (major units). */
export interface BusinessPeriod {
  /** Self-serve accounts created. */
  accounts: number;
  /** …of which verified their email — a completed registration. */
  registrations: number;
  /** Fleets created — every new fleet starts on the free trial. */
  trials: number;
  /** New paying fleets (subscribed in the period). */
  paid: number;
  newMrr: number;
  renewals: number;
  renewalRevenue: number;
  upgrades: number;
  downgrades: number;
  expansionMrr: number;
  contractionMrr: number;
  cancellations: number;
  cancelRequests: number;
  lostMrr: number;
  /** Paying fleets at the start of the period (worked back from today). */
  payingAtStart: number;
  /** cancellations ÷ payingAtStart, or null when nobody was paying. */
  churnRate: number | null;
  failedPayments: number;
  failedAmount: number;
  recovered: number;
  checkoutFailed: number;
  checkoutAbandoned: number;
}

export interface TrialRow {
  id: string;
  name: string;
  startedAt: string;
  endsAt: string | null;
  status: 'running' | 'expired' | 'paid' | 'cancelled';
  vehicles: number;
  drivers: number;
  ownerEmail: string | null;
}

export interface BusinessData {
  generatedAt: string;
  stripeEnabled: boolean;
  /** billing_events exists (migration 20261123 applied). */
  billingReady: boolean;
  /** Oldest billing event on record — history before it isn't known. */
  billingSince: string | null;
  current: BusinessPeriod;
  previous: BusinessPeriod;
  /** Fleets created in the period, followed to today. */
  funnel: { accounts: number; registrations: number; trials: number; activated: number; paid: number };
  trials: {
    /** Right now, across every fleet. */
    active: number;
    expired: number;
    unused: number;
    expiringSoon: number;
    cohortUnit: CohortUnit;
    cohorts: { start: string; started: number; paid: number; expired: number; running: number; unused: number; activated: number }[];
    /** Trials that started in the period, soonest-ending first. */
    list: TrialRow[];
  };
  revenue: {
    mrr: number;
    arr: number;
    activePaid: number;
    arpa: number;
    pastDue: number;
    plans: { key: string; name: string; color: string | null; accounts: number; mrr: number; newInPeriod: number }[];
    newSubs: { at: string; orgId: string | null; org: string; plan: string | null; amount: number | null }[];
    changes: { at: string; orgId: string | null; org: string; kind: 'upgraded' | 'downgraded'; planFrom: string | null; planTo: string | null; amount: number | null }[];
  };
  retention: {
    reasons: { reason: string; count: number }[];
    cancellations: { at: string; orgId: string | null; org: string; kind: 'cancelled' | 'cancel_scheduled'; plan: string | null; reason: string | null; comment: string | null; amount: number | null }[];
    failed: { at: string; orgId: string | null; org: string; amount: number | null; currency: string | null; reason: string | null; attempts: number | null; recovered: boolean }[];
    pastDueNow: { orgId: string; org: string; status: string | null }[];
    /** Fleets marked cancelled with no recorded cancellation date (before history began). */
    unknownCancelled: number;
  };
  friction: {
    checkout: { device: string; failed: number; abandoned: number }[];
    failedByReason: { reason: string; count: number }[];
  };
  /** New paying fleets in the period, credited to the visit they signed up from. */
  attribution: { channel: string; source: string; campaign: string | null; paying: number }[];
  planNames: Record<string, string>;
}

export interface SpeedRow {
  path?: string;
  device: string;
  samples: number;
  slow: number;
  lcp: number | null;
  fcp: number | null;
  ttfb: number | null;
  inp: number | null;
  cls: number | null;
  load_ms: number | null;
}

export interface ExtrasData {
  scroll: { measured: number; r25: number; r50: number; r75: number; r100: number; avg_scroll: number; avg_engaged_ms: number };
  engagement: { visits: number; engaged: number; by_device: { device: string; visits: number; engaged: number; bounces: number; engaged_ms: number }[] };
  interactions: { name: string; label: string | null; device: string; count: number; visitors: number }[];
  seen: { name: 'Section viewed' | 'Screenshot viewed'; path: string; label: string; visits: number; page_visits: number }[];
  speed: { pages: SpeedRow[]; devices: SpeedRow[] };
  not_found: { path: string; from: string; device: string; count: number; visitors: number }[];
  before_signup: { signups: number; tracked: number; avg_pages: number; pages: { path: string; signups: number }[] };
  notes_since: string | null;
}
