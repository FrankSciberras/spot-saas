// Shared types for the Rovora Admin Console (platform back-office).
// Operators = organizations (fleets). Packages = the real plan catalogue.
// Billing metrics are derived from real plan assignments + timestamps.

// A plan key: 'trial' (built-in) or any package `key` from the dynamic catalogue.
export type RealPlan = string;

/** Display label + colours for a plan key, derived from the catalogue. */
export interface PlanMeta {
  label: string;
  color: string;
  bg: string;
}

/** Mockup-aligned operator status used for pills / filtering. */
export type OpStatus = 'active' | 'trial' | 'past_due' | 'churned';

export interface Operator {
  id: string;
  name: string;
  slug: string;
  plan: RealPlan;
  status: OpStatus;
  /** Raw organizations.status (active | suspended | cancelled). */
  rawStatus: string;
  vehicles: number;
  drivers: number;
  members: number;
  /** Monthly recurring revenue in EUR (0 when not on a paid+paying plan). */
  mrr: number;
  /** created_at ISO. */
  since: string;
  /** Next renewal ISO, trial end ISO, or null. */
  renews: string | null;
  /** Whole days remaining in trial (0 when not trialing). */
  trialDaysLeft: number;
  /** Owner / first admin email, if resolvable. */
  ownerEmail: string | null;
  initials: string;
  color: string;
}

export interface PlanMixEntry {
  id: RealPlan;
  name: string;
  color: string;
  accounts: number;
  vehicles: number;
  mrr: number;
}

export interface TrendPoint {
  label: string;
  v: number;
}

export interface ActivityItem {
  who: string;
  what: string;
  meta: string;
  /** Relative time label, e.g. "2h", "3d". */
  t: string;
  kind: 'trial' | 'upgrade' | 'expand' | 'payment' | 'failed' | 'churn';
}

export interface AdminMetrics {
  mrr: number;
  arr: number;
  active: number;
  trials: number;
  pastDue: number;
  churned: number;
  vehicles: number;
  arpa: number;
  payingCount: number;
  pastDueMrr: number;
  /** Monthly recurring revenue lost to churned (cancelled) operators, EUR. */
  lostMrr: number;
}

export interface PackageDef {
  id: RealPlan;
  name: string;
  rate: number; // EUR / month (flat)
  blurb: string;
  cap: string;
  features: string[];
  color: string;
  popular?: boolean;
}

/**
 * Real per-operator billing status, derived from the organizations table (plan,
 * subscription_status, current_period_end). Actual invoices live in Stripe and
 * are reached via `stripeUrl` — we deliberately don't fabricate invoice rows.
 */
export interface BillingRow {
  /** Organization id. */
  id: string;
  operator: string;
  initials: string;
  color: string;
  plan: RealPlan;
  /** Committed monthly amount, EUR. */
  amount: number;
  /** Simplified billing state for the pill. */
  status: 'active' | 'past_due' | 'trialing' | 'canceled';
  /** Raw Stripe subscription status mirror, if the operator checked out. */
  subscriptionStatus: string | null;
  /** Renewal / period-end ISO, or null. */
  renewsAt: string | null;
  /** Stripe dashboard deep-link for real invoices, or null (no Stripe customer). */
  stripeUrl: string | null;
}

/** Triage state for a contact-form inquiry. */
export type InquiryStatus = 'new' | 'read' | 'replied' | 'archived';

/** A submission from the public /contact form, shown in the admin Inbox. */
export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** Company / fleet name the sender typed. */
  company: string | null;
  fleetSize: string | null;
  /** sales | support | partnership | other. */
  topic: string;
  message: string;
  status: InquiryStatus;
  source: string;
  /** ISO created timestamp. */
  createdAt: string;
  /** ISO timestamp of the last admin action, or null. */
  handledAt: string | null;
}

export interface AdminData {
  operators: Operator[];
  metrics: AdminMetrics;
  planMix: PlanMixEntry[];
  trend: TrendPoint[];
  activity: ActivityItem[];
  packages: PackageDef[];
  billing: BillingRow[];
  /** Contact-form submissions, newest first. */
  inquiries: Inquiry[];
  totals: { operators: number; users: number; drivers: number; vehicles: number };
  /** Month-over-month MRR growth %, from the trend tail. */
  momGrowth: number;
  adminEmail: string;
  /** Display label + colours per plan key (incl. 'trial'), from the catalogue. */
  planMeta: Record<string, PlanMeta>;
  /** Plan keys a platform admin can assign to an operator (incl. 'trial'). */
  assignablePlans: string[];
}
