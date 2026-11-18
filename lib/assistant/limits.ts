// =============================================================================
// ROVORA AI — monthly € allowance per plan + per-person rate limits
// =============================================================================
// Three layers, all checked atomically in Postgres before any LLM call
// (assistant_usage_begin in supabase/migrations/20261118_fleet_assistant.sql):
//
//   1. Per person:   questions per minute and per day (plans.ai_rate_limit_*)
//   2. Per fleet:    euros per calendar month (plans.ai_monthly_budget_eur)
//   3. Per platform: euros per month across ALL fleets — a backstop on Rovora's
//                    own OpenAI bill (FLEET_ASSISTANT_PLATFORM_BUDGET_EUR)
//
// Each question first RESERVES the most it may cost (MAX_EUR_PER_QUESTION); the
// runner stops before any call that could exceed it, then the real cost
// replaces the reservation. So the monthly allowance is a hard ceiling, not an
// after-the-fact report.
//
// Trial fleets aren't a plan row — their limits are TRIAL_LIMITS below.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { TRIAL_PLAN } from '@/lib/billing/plans';
import { FLEET_TIME_ZONE } from './context';

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Most a single question may cost, in euros (reserved up front). */
export function maxEurPerQuestion(): number {
  return envNumber('FLEET_ASSISTANT_MAX_EUR_PER_QUESTION', 0.05, 0.005, 2);
}

/** Ceiling on Rovora's total AI spend per month across every fleet. */
export function platformMonthlyBudgetEur(): number {
  return envNumber('FLEET_ASSISTANT_PLATFORM_BUDGET_EUR', 100, 0, 100_000);
}

/** Free-period fleets: a taste, not the full allowance. */
export function trialLimits() {
  return {
    monthlyBudgetEur: envNumber('FLEET_ASSISTANT_TRIAL_BUDGET_EUR', 1, 0, 1000),
    perMinute: Math.round(envNumber('FLEET_ASSISTANT_TRIAL_PER_MIN', 4, 1, 600)),
    perDay: Math.round(envNumber('FLEET_ASSISTANT_TRIAL_PER_DAY', 30, 1, 100_000)),
  };
}

/**
 * Is Rovora AI switched on for this fleet at all? During beta that's the
 * FLEET_ASSISTANT_BETA_ORGS allow-list (comma-separated organization ids, "*" =
 * every fleet). The `assistant` module, once it exists in lib/modules/catalog,
 * also switches it on — that's the path to general availability.
 */
export function assistantSwitchedOn(organizationId: string, modules: Set<string>): boolean {
  if (modules.has('assistant')) return true;
  const list = (process.env.FLEET_ASSISTANT_BETA_ORGS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes('*') || list.includes(organizationId.toLowerCase());
}

export type EntitlementReason =
  | 'no_organization'
  | 'account_suspended'
  | 'trial_expired'
  | 'plan_not_included'
  | 'not_set_up';

export interface AssistantEntitlement {
  enabled: boolean;
  reason: EntitlementReason | null;
  planKey: string;
  planName: string;
  onTrial: boolean;
  monthlyBudgetEur: number;
  perMinute: number;
  perDay: number;
}

type PlanAiRow = {
  key: string;
  name: string;
  ai_enabled: boolean;
  ai_monthly_budget_eur: number | string;
  ai_rate_limit_per_min: number;
  ai_rate_limit_per_day: number;
};

const OFF = (reason: EntitlementReason, planKey: string, planName: string, onTrial = false): AssistantEntitlement => ({
  enabled: false,
  reason,
  planKey,
  planName,
  onTrial,
  monthlyBudgetEur: 0,
  perMinute: 0,
  perDay: 0,
});

/** Postgres "column/relation does not exist" — the migration isn't applied yet. */
const notMigrated = (code?: string) => code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205';

/**
 * What this fleet's plan allows. Service-role read (the plans' ai_* columns are
 * deliberately not part of the public PlanDef, so allowances never reach a
 * marketing page).
 */
export async function getAssistantEntitlement(organizationId: string): Promise<AssistantEntitlement> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('plan, status, trial_ends_at')
    .eq('id', organizationId)
    .maybeSingle();
  if (!org) return OFF('no_organization', 'unknown', 'Unknown');

  const planKey = (org.plan as string | null) ?? TRIAL_PLAN;
  if (org.status === 'suspended' || org.status === 'cancelled') return OFF('account_suspended', planKey, planKey);

  if (planKey === TRIAL_PLAN) {
    const expired = !org.trial_ends_at || new Date() > new Date(org.trial_ends_at as string);
    if (expired) return OFF('trial_expired', planKey, 'Free period', true);
    const t = trialLimits();
    return {
      enabled: t.monthlyBudgetEur > 0,
      reason: t.monthlyBudgetEur > 0 ? null : 'plan_not_included',
      planKey,
      planName: 'Free period',
      onTrial: true,
      ...t,
    };
  }

  const { data: plan, error } = await admin
    .from('plans')
    .select('key, name, ai_enabled, ai_monthly_budget_eur, ai_rate_limit_per_min, ai_rate_limit_per_day')
    .eq('key', planKey)
    .maybeSingle();
  if (error && notMigrated(error.code)) return OFF('not_set_up', planKey, planKey);
  const row = plan as PlanAiRow | null;
  if (!row || !row.ai_enabled) return OFF('plan_not_included', planKey, row?.name ?? planKey);

  const budget = Number(row.ai_monthly_budget_eur) || 0;
  return {
    enabled: budget > 0,
    reason: budget > 0 ? null : 'plan_not_included',
    planKey,
    planName: row.name,
    onTrial: false,
    monthlyBudgetEur: budget,
    perMinute: row.ai_rate_limit_per_min,
    perDay: row.ai_rate_limit_per_day,
  };
}

export type BeginDenied = 'rate_minute' | 'rate_day' | 'budget' | 'platform_budget' | 'not_set_up' | 'error';

export type BeginResult =
  | { ok: true; usageId: string; monthSpentEur: number; reservedEur: number }
  | { ok: false; reason: BeginDenied; monthSpentEur: number };

/** Reserve one question's worth of allowance, or say why not. */
export async function beginQuestion(opts: {
  organizationId: string;
  userId: string;
  conversationId: string | null;
  entitlement: AssistantEntitlement;
}): Promise<BeginResult> {
  const reserve = maxEurPerQuestion();
  const { data, error } = await createAdminClient().rpc('assistant_usage_begin', {
    p_org: opts.organizationId,
    p_user: opts.userId,
    p_conversation: opts.conversationId,
    p_monthly_budget_eur: opts.entitlement.monthlyBudgetEur,
    p_reserve_eur: reserve,
    p_per_min: opts.entitlement.perMinute,
    p_per_day: opts.entitlement.perDay,
    p_platform_budget_eur: platformMonthlyBudgetEur(),
    p_time_zone: FLEET_TIME_ZONE,
  });
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883' || notMigrated(error.code);
    console.error(`[assistant] usage gate failed (${error.code}): ${error.message}`);
    return { ok: false, reason: missing ? 'not_set_up' : 'error', monthSpentEur: 0 };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; reason: string | null; usage_id: string | null; month_spent_eur: number | string }
    | undefined;
  if (!row) return { ok: false, reason: 'error', monthSpentEur: 0 };
  const spent = Number(row.month_spent_eur) || 0;
  if (!row.allowed || !row.usage_id) {
    if (row.reason === 'platform_budget') {
      // Loud on purpose: every fleet's assistant is now off until next month.
      console.error(`[assistant] PLATFORM MONTHLY BUDGET (€${platformMonthlyBudgetEur()}) REACHED — raise FLEET_ASSISTANT_PLATFORM_BUDGET_EUR to resume.`);
    }
    return { ok: false, reason: (row.reason as BeginDenied) ?? 'error', monthSpentEur: spent };
  }
  return { ok: true, usageId: row.usage_id, monthSpentEur: spent, reservedEur: reserve };
}

export interface QuestionTotals {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  llmCalls: number;
  toolCalls: number;
  costEur: number;
}

/** Replace the reservation with what the question really cost. */
export async function finishQuestion(
  usageId: string,
  organizationId: string,
  status: 'done' | 'failed',
  t: QuestionTotals,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('assistant_usage')
    .update({
      status,
      model: t.model,
      input_tokens: t.inputTokens,
      cached_input_tokens: t.cachedInputTokens,
      output_tokens: t.outputTokens,
      llm_calls: t.llmCalls,
      tool_calls: t.toolCalls,
      cost_eur: Math.max(0, Number(t.costEur.toFixed(6))),
      finished_at: new Date().toISOString(),
    })
    .eq('id', usageId)
    .eq('organization_id', organizationId);
  // If this write fails the row stays 'reserved' and is later closed as
  // 'abandoned' at the reserved amount — the fleet is never under-charged.
  if (error) console.error(`[assistant] could not record usage ${usageId}: ${error.message}`);
}

export interface UsageSummary {
  monthStart: string;
  resetsOn: string;
  spentEur: number;
  budgetEur: number;
  percentUsed: number;
  questionsThisMonth: number;
}

/** First day of this month and of next month (when the allowance renews), fleet-local. */
export function monthBounds(timeZone: string = FLEET_TIME_ZONE, now = new Date()): { monthStart: string; resetsOn: string } {
  const today = now.toLocaleDateString('en-CA', { timeZone });
  const [y, m] = today.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { monthStart, resetsOn: next };
}

/** This month's spend for a fleet against its allowance (summed in SQL). */
export async function getUsageSummary(organizationId: string, entitlement: AssistantEntitlement): Promise<UsageSummary> {
  const { monthStart, resetsOn } = monthBounds(FLEET_TIME_ZONE);
  const { data, error } = await createAdminClient().rpc('assistant_usage_summary', {
    p_org: organizationId,
    p_time_zone: FLEET_TIME_ZONE,
  });
  if (error) console.error(`[assistant] usage summary failed (${error.code}): ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { spent_eur: number | string; questions: number } | undefined;
  const spent = Number(row?.spent_eur) || 0;
  const budget = entitlement.monthlyBudgetEur;
  return {
    monthStart,
    resetsOn,
    spentEur: Math.round(spent * 10_000) / 10_000,
    budgetEur: budget,
    percentUsed: budget > 0 ? Math.min(100, Math.round((spent / budget) * 1000) / 10) : 100,
    questionsThisMonth: row?.questions ?? 0,
  };
}

/** Friendly text for a refused question. Admins see the € figures; staff don't. */
export function deniedMessage(
  reason: BeginDenied | EntitlementReason,
  opts: { isAdmin: boolean; entitlement: AssistantEntitlement; resetsOn?: string },
): string {
  const resets = opts.resetsOn
    ? new Date(`${opts.resetsOn}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    : 'the 1st of next month';
  switch (reason) {
    case 'rate_minute':
      return 'You’re asking a little fast — give it a minute and try again.';
    case 'rate_day':
      return `You’ve reached today’s limit of ${opts.entitlement.perDay} questions. It resets at midnight.`;
    case 'budget':
      return opts.isAdmin
        ? `Your fleet has used this month’s Rovora AI allowance (€${opts.entitlement.monthlyBudgetEur.toFixed(2)} on the ${opts.entitlement.planName} plan). It renews on ${resets}${opts.entitlement.onTrial ? '' : ' — or move to a bigger plan for a larger allowance'}.`
        : `Your fleet has used this month’s Rovora AI allowance. It renews on ${resets}; your admin can upgrade the plan for more.`;
    case 'platform_budget':
      return 'Rovora AI is paused for the rest of the month while we add capacity. Sorry about that — everything else works as normal.';
    case 'plan_not_included':
      return opts.isAdmin
        ? `Rovora AI isn’t included in the ${opts.entitlement.planName} plan. Upgrade in Billing to switch it on.`
        : 'Rovora AI isn’t included in your fleet’s plan. Your admin can switch it on from Billing.';
    case 'trial_expired':
      return 'Pick a plan in Billing to keep using Rovora AI.';
    case 'account_suspended':
      return 'This fleet’s account is paused, so Rovora AI is unavailable.';
    case 'not_set_up':
      return 'Rovora AI is still being set up for your fleet. Please try again later.';
    default:
      return 'Rovora AI couldn’t start just now. Please try again in a moment.';
  }
}
