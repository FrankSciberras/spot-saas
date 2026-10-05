import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import { pendingInvitesForUser } from '@/lib/invites';

/**
 * "Fleet X invited you" strip for the top of the fleet and driver home pages,
 * so an invitation isn't only discoverable through email. Renders nothing when
 * there's no open invite (the common case: one cheap indexed query).
 */
export default async function InviteBanner({ userId }: { userId: string }) {
  const invites = await pendingInvitesForUser(createAdminClient(), userId);
  if (!invites.length) return null;

  const first = invites[0].organization_name;
  const text =
    invites.length === 1
      ? `${first} has invited you to join their fleet.`
      : `${first} and ${invites.length - 1} other fleet${invites.length > 2 ? 's have' : ' has'} invited you to join them.`;

  return (
    <Link
      href="/invites"
      className="fleetHover"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        marginBottom: 16,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--accent-soft)',
        border: '1px solid var(--accent-line)',
        color: 'var(--text-1)',
        fontSize: 14,
        textDecoration: 'none',
      }}
    >
      <span style={{ flex: 1 }}>{text}</span>
      <span style={{ color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap' }}>Review →</span>
    </Link>
  );
}
