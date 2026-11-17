import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import FleetShell from '@/components/fleet/FleetShell';
import MessagesApp from '@/components/messages/MessagesApp';

export const dynamic = 'force-dynamic';

/**
 * Messages — the fleet's chats (direct, groups, "Everyone"). The screen itself
 * is a client component that talks to /api/messages and Supabase Realtime.
 * `?c=<id>` opens a chat directly (notifications link here).
 */
export default async function FleetMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'messaging');
  const { c } = await searchParams;
  const initial = c && /^[0-9a-f-]{36}$/i.test(c) ? c : null;

  return (
    <FleetShell user={user} title="Messages">
      <MessagesApp userId={user.id} organizationId={user.organization_id} variant="fleet" initialConversationId={initial} />
    </FleetShell>
  );
}
