import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { assistantRoleFor } from '@/lib/assistant/context';
import { getAssistantEntitlement, getUsageSummary } from '@/lib/assistant/limits';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/assistant/usage — this fleet's Rovora AI allowance for the month.
// Admins see euros; staff see only how much of the allowance is used.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = assistantRoleFor(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const entitlement = await getAssistantEntitlement(session.organization_id);
  const summary = await getUsageSummary(session.organization_id, entitlement);

  return NextResponse.json(
    {
      enabled: entitlement.enabled,
      reason: entitlement.reason,
      plan: entitlement.planName,
      percent_used: summary.percentUsed,
      resets_on: summary.resetsOn,
      per_minute: entitlement.perMinute,
      per_day: entitlement.perDay,
      ...(role === 'admin'
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
