'use server';

// =============================================================================
// RUN NOTIFICATION RULES NOW (fleet admin, own org)
// =============================================================================
// Lets a fleet admin evaluate their own org's active rules on demand — useful to
// test rule config without waiting for the scheduled sweep. Scoped to the
// caller's active organization; the cross-org sweep is the cron endpoint.
// =============================================================================

import { getSession } from '@/lib/auth/session';
import { evaluateNotificationRules, type EngineReport } from '@/lib/notifications/engine';

export async function runRulesNowAction(): Promise<{ error?: string; report?: EngineReport }> {
  const session = await getSession();
  if (!session) return { error: 'Not signed in.' };
  if (session.role !== 'admin') return { error: 'Only a fleet admin can run notification rules.' };

  const report = await evaluateNotificationRules({ orgId: session.organization_id });
  return { report };
}
