import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { getEnabledModuleKeys } from '@/lib/modules/server';
import { assistantRoleFor } from '@/lib/assistant/context';
import { assistantSwitchedOn, deniedMessage, getAssistantEntitlement, getUsageSummary } from '@/lib/assistant/limits';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/assistant/usage — can this person use Rovora AI, and how much of
// the fleet's monthly allowance is left? The dashboard calls it once per page
// load to decide whether to show the "Ask AI" button.
// Admins see euros; staff see only how much of the allowance is used.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = assistantRoleFor(session);
  if (!role) return NextResponse.json({ available: false, reason: 'forbidden' }, { status: 200 });

  const modules = await getEnabledModuleKeys(session.organization_id);
  // Platform admins can always try it in their own fleets (see /api/assistant).
  if (!assistantSwitchedOn(session.organization_id, modules) && !(await isPlatformAdmin())) {
    return NextResponse.json({ available: false, reason: 'not_enabled' }, { headers: { 'cache-control': 'private, no-store' } });
  }

  const entitlement = await getAssistantEntitlement(session.organization_id);
  const summary = await getUsageSummary(session.organization_id, entitlement);
  const isAdmin = role === 'admin';

  return NextResponse.json(
    {
      // Shown when the plan doesn't include it, so the button can explain why.
      available: true,
      enabled: entitlement.enabled,
      reason: entitlement.reason,
      message: entitlement.enabled
        ? null
        : deniedMessage(entitlement.reason ?? 'plan_not_included', { isAdmin, entitlement }),
      role,
      plan: entitlement.planName,
      percent_used: summary.percentUsed,
      resets_on: summary.resetsOn,
      per_minute: entitlement.perMinute,
      per_day: entitlement.perDay,
      ...(isAdmin
        ? {
            budget_eur: summary.budgetEur,
            spent_eur: summary.spentEur,
            questions_this_month: summary.questionsThisMonth,
          }
        : {}),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
