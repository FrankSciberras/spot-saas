import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import FleetShell from '@/components/fleet/FleetShell';
import MessagesApp from '@/components/messages/MessagesApp';

export const dynamic = 'force-dynamic';

/**
 * A driver's chats with their managers and fleet groups. Same screen as the
 * managers' /fleet/messages; the API decides what each person may do. If the
 * fleet has Messages switched off, the screen says so.
 */
export default async function DriverMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireRole(['driver', 'admin', 'staff']);
  const { c } = await searchParams;
  const initial = c && /^[0-9a-f-]{36}$/i.test(c) ? c : null;

  // Managers use the fleet version (same chats, fleet navigation).
  if (user.role !== 'driver') redirect(initial ? `/fleet/messages?c=${initial}` : '/fleet/messages');

  return (
    <FleetShell user={user} variant="driver" title="Messages">
      <MessagesApp userId={user.id} organizationId={user.organization_id} variant="driver" initialConversationId={initial} />
    </FleetShell>
  );
}
