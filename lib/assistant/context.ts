// =============================================================================
// ROVORA AI — who is asking, for which fleet, with what switched on
// =============================================================================

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getEnabledModuleKeys } from '@/lib/modules/server';
import type { SessionUser } from '@/lib/types/database';
import { todayIn } from './period';
import type { AssistantContext, AssistantPage, AssistantRole } from './types';

/**
 * The fleet's time zone. Same source the shifts, notifications and tracking
 * code use today; the Settings work may turn this into a per-fleet setting —
 * when it does, read it here and nowhere else.
 */
export const FLEET_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

/**
 * Money is EUR across the dashboard today. When the per-fleet currency setting
 * (lib/money.ts, `finance.currency`) lands, read it here.
 */
const FLEET_CURRENCY = { code: 'EUR', symbol: '€' };

/** Map a session to an assistant role. Drivers (without also_staff) get none. */
export function assistantRoleFor(session: Pick<SessionUser, 'role' | 'also_staff'>): AssistantRole | null {
  if (session.role === 'admin') return 'admin';
  if (session.role === 'staff') return 'staff';
  if (session.role === 'driver' && session.also_staff) return 'staff';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The page hint the browser sends. Only plain /fleet paths are kept — it goes
 * into a model prompt, so it must not be able to carry text.
 */
export function sanitizePage(input: unknown): AssistantPage | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const path = (input as { path?: unknown }).path;
  if (typeof path !== 'string' || !/^\/fleet(\/[a-zA-Z0-9_-]{1,64}){0,4}\/?$/.test(path)) return undefined;
  const m = /^\/fleet\/(drivers|vehicles)\/([0-9a-f-]{36})(\/|$)/i.exec(path);
  const entity =
    m && UUID.test(m[2]) ? { type: m[1] === 'drivers' ? ('driver' as const) : ('vehicle' as const), id: m[2].toLowerCase() } : undefined;
  return { path, entity };
}

export async function buildAssistantContext(
  session: SessionUser,
  role: AssistantRole,
  page?: AssistantPage,
): Promise<AssistantContext> {
  const [db, modules] = await Promise.all([createClient(), getEnabledModuleKeys(session.organization_id)]);
  return {
    orgId: session.organization_id,
    orgName: session.organization_name ?? 'your fleet',
    userId: session.id,
    userName: session.full_name,
    role,
    isAdmin: role === 'admin',
    modules,
    db,
    admin: createAdminClient,
    timeZone: FLEET_TIME_ZONE,
    today: todayIn(FLEET_TIME_ZONE),
    currency: FLEET_CURRENCY,
    page,
  };
}
