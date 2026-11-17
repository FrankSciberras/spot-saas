import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getEnabledModuleKeys } from '@/lib/modules/server';
import { MESSAGING_MODULE, noStore } from '@/lib/messages/server';

/**
 * GET /api/messages/unread — { enabled, count } for the menu badge. Polled,
 * so it never errors loudly: signed out, module off or migration not run all
 * just come back as "nothing to show".
 */
export async function GET() {
  const session = await getSession();
  if (!session) return noStore({ enabled: false, count: 0 });

  const enabled = (await getEnabledModuleKeys(session.organization_id)).has(MESSAGING_MODULE);
  if (!enabled) return noStore({ enabled: false, count: 0 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('chat_unread_total', { p_org: session.organization_id });
  if (error) return noStore({ enabled: true, count: 0 });
  return noStore({ enabled: true, count: typeof data === 'number' ? data : 0 });
}
