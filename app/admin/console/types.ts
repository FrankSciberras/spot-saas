// Shared types for the Spot Admin Console (platform back-office).
// Operators = organizations (fleets). Packages = the real plan catalogue.
// Billing metrics are derived from real plan assignments + timestamps.

export type RealPlan = 'trial' | 'starter' | 'growth' | 'scale';

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

export interface InvoiceRow {
  id: string;
  operator: string;
  initials: string;
  color: string;
  plan: RealPlan;
  amount: number;
  /** Period label, e.g. "May 2026". */
  period: string;
  status: 'open' | 'paid' | 'failed';
  due: string; // ISO
}

export interface AdminData {
  operators: Operator[];
  metrics: AdminMetrics;
  planMix: PlanMixEntry[];
  trend: TrendPoint[];
  activity: ActivityItem[];
  packages: PackageDef[];
  invoices: InvoiceRow[];
  totals: { operators: number; users: number; drivers: number; vehicles: number };
  /** Month-over-month MRR growth %, from the trend tail. */
  momGrowth: number;
  adminEmail: string;
}

// ── Plan presentation + flat monthly pricing (EUR) ──
// Real catalogue is flat-rate (lib/billing/plans.ts uses $49 / $149 / Custom).
// We mirror those as EUR here; `scale` is a nominal figure for an otherwise
// "Custom" tier so platform metrics have a number to total.
export const PLAN_PRICE: Record<RealPlan, number> = {
  trial: 0,
  starter: 49,
  growth: 149,
  scale: 399,
};

export const PLAN_META: Record<RealPlan, { label: string; color: string }> = {
  trial: { label: 'Trial', color: 'var(--text-3)' },
  starter: { label: 'Starter', color: 'var(--text-2)' },
  growth: { label: 'Growth', color: 'var(--accent)' },
  scale: { label: 'Scale', color: '#a78bfa' },
};
